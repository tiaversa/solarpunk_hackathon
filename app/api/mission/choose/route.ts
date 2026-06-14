import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helper";
import { isTopicId, TOPIC_IDS, type TopicId } from "@/lib/missionMatrix";
import { isLevel, MAX_LEVEL, MIN_LEVEL, type Level } from "@/lib/levels";
import { MISSION_OPTIONS_COUNT } from "@/lib/missions";
import {
  findOrFetchCityResources,
  type CityResourcePlace,
} from "@/lib/cityResources";

// Hard ceiling on the OSM lookup. Cache hits return in <50ms; cold
// lookups call out to Nominatim + Overpass which can be slow under
// load. Capping at 3s keeps the choose action snappy — if OSM is having
// a bad day the user just sees zero places and we'll populate the
// cache on the next attempt.
const CITY_RESOURCES_BUDGET_MS = 3000;

const Body = z.object({
  topic: z.string().refine(isTopicId, {
    message: `topic must be one of: ${TOPIC_IDS.join(", ")}`,
  }),
  level: z.number().int().refine(isLevel, {
    message: `level must be an integer ${MIN_LEVEL}-${MAX_LEVEL}`,
  }),
  aiGenerationId: z.string().uuid(),
  chosenIndex: z
    .number()
    .int()
    .min(0)
    .max(MISSION_OPTIONS_COUNT - 1),
});

export async function POST(req: Request) {
  const auth = await requireUserId();
  if (auth.response) return auth.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const { aiGenerationId, chosenIndex } = parsed.data;
  const topic = parsed.data.topic as TopicId;
  const level = parsed.data.level as Level;

  // Defensive lookup: confirm the AiGeneration belongs to this user and
  // matches the (topic, level) the caller claims. Prevents a malicious
  // request from referencing someone else's generation row.
  const generation = await prisma.aiGeneration.findFirst({
    where: {
      id: aiGenerationId,
      userId: auth.userId,
      topic,
      level,
      status: "active",
    },
    select: { parsedOptions: true },
  });
  if (!generation || !generation.parsedOptions) {
    return NextResponse.json(
      { error: "No active mission generation for that (topic, level)" },
      { status: 404 },
    );
  }
  const optionsPresented = generation.parsedOptions as Prisma.InputJsonValue;

  // Upsert: if an active choice already exists for (userId, topic, level)
  // UPDATE it; otherwise INSERT. The partial unique index
  // (unique_active_choice WHERE status='active') prevents concurrent
  // double-inserts.
  try {
    const existing = await prisma.missionChoice.findFirst({
      where: { userId: auth.userId, topic, level, status: "active" },
      select: { id: true },
    });

    const row = existing
      ? await prisma.missionChoice.update({
          where: { id: existing.id },
          data: { aiGenerationId, chosenIndex, optionsPresented },
          select: { id: true, status: true },
        })
      : await prisma.missionChoice.create({
          data: {
            userId: auth.userId,
            topic,
            level,
            aiGenerationId,
            optionsPresented,
            chosenIndex,
          },
          select: { id: true, status: true },
        });

    // Fetch (or read cached) Solarpunk-aligned local places for this
    // user's city + topic. The lookup is best-effort: any failure or
    // timeout yields an empty list — the choose action itself has
    // already succeeded above and must not be unwound.
    const places = await lookupCityPlaces(auth.userId, topic);

    return NextResponse.json({
      missionChoiceId: row.id,
      status: row.status,
      places,
    });
  } catch (err) {
    // P2002 = unique constraint violation. Should be rare thanks to the
    // existence check above but the partial unique index is the real
    // guard against concurrent inserts.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Another active choice already exists for that level" },
        { status: 409 },
      );
    }
    throw err;
  }
}

/**
 * Look up the user's city, then fetch (or read cached) Solarpunk-aligned
 * places for (city, topic). Returns [] for any failure path:
 *
 *   - user has no city set
 *   - the overall 3s budget elapses
 *   - Nominatim or Overpass time out or 5xx
 *   - the cache lookup throws
 *
 * Failures are intentionally swallowed: the choose action already
 * succeeded by the time we get here and missing places must never
 * surface as a 5xx to the client.
 */
async function lookupCityPlaces(
  userId: string,
  topic: TopicId,
): Promise<CityResourcePlace[]> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { city: true },
    });
    const city = user?.city?.trim();
    if (!city) return [];

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      CITY_RESOURCES_BUDGET_MS,
    );
    try {
      return await findOrFetchCityResources(city, topic, controller.signal);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return [];
  }
}
