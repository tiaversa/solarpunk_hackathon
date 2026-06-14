import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helper";
import { isTopicId, TOPIC_IDS, type TopicId } from "@/lib/missionMatrix";
import { isLevel, MAX_LEVEL, MIN_LEVEL, type Level } from "@/lib/levels";
import { MISSION_OPTIONS_COUNT, type MissionOption } from "@/lib/missions";
import {
  findOrFetchCityResources,
  type CityResourcePlace,
} from "@/lib/cityResources";
import { rankPlacesForMission } from "@/lib/placeRanking";

// Hard ceiling on the OSM lookup. Cache hits return in <50ms; cold
// lookups call out to Nominatim + Overpass which can be slow under
// load — Berlin's accessibility query (5 tags × 3 element types,
// each with a 5km radius scan) routinely needs 4-6s. We use 8s as a
// pragmatic ceiling: long enough that cold lookups in big cities
// usually succeed, short enough that a truly hung Overpass server
// doesn't pin the choose action indefinitely. Subsequent choices in
// the same (city, topic) hit the cache and return in <50ms.
const CITY_RESOURCES_BUDGET_MS = 8000;

// Separate budget for the Claude ranking call. Empirically ~1s; 5s is a
// generous kill-switch so a slow Anthropic response doesn't stretch the
// choose action indefinitely. Falls back to the unranked top-N from
// CityResources on timeout.
const PLACE_RANKING_BUDGET_MS = 5000;

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
  // Same payload re-cast for our own use — pulling the chosen mission's
  // text out so we can feed it to the place ranker below.
  const chosenMission = extractChosenMission(
    generation.parsedOptions,
    chosenIndex,
  );

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

    // Rank places against THIS specific mission so each card on the
    // level surfaces different on-the-ground support. We persist the
    // ranked subset on the MissionChoice so subsequent page renders
    // can show it without another Claude call. A null result here
    // means ranking was skipped (no places) or failed — the client
    // and the topic page both fall back to the unranked top-N from
    // CityResources, so this is purely a quality improvement, never
    // a correctness requirement.
    const rankedPlaces =
      chosenMission && places.length > 0
        ? await rankWithBudget(chosenMission, places)
        : null;

    if (rankedPlaces) {
      // Best-effort persist. If this UPDATE fails the choose action
      // already returned a valid row above, so we swallow the error
      // — the next choose will overwrite anyway.
      try {
        await prisma.missionChoice.update({
          where: { id: row.id },
          data: { rankedPlaces: rankedPlaces as unknown as object },
        });
      } catch {
        // intentionally ignored
      }
    }

    return NextResponse.json({
      missionChoiceId: row.id,
      status: row.status,
      places: rankedPlaces ?? places.slice(0, 5),
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

/**
 * Wrap rankPlacesForMission with a budget so a slow Claude doesn't
 * stretch the choose response indefinitely. Mirrors the OSM lookup's
 * budget pattern.
 */
async function rankWithBudget(
  mission: MissionOption,
  places: CityResourcePlace[],
): Promise<CityResourcePlace[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    PLACE_RANKING_BUDGET_MS,
  );
  try {
    return await rankPlacesForMission(mission, places, controller.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pull the chosen mission out of an AiGeneration.parsedOptions blob.
 *
 * `parsedOptions` is typed as JSON but we know from the upstream Zod
 * schema in lib/missions.ts (MissionOptionsArray) that it's an array
 * of 3 MissionOption objects. We still validate the shape defensively
 * — a corrupt row should yield `null` and skip ranking, not crash the
 * choose action.
 */
function extractChosenMission(
  parsedOptions: Prisma.JsonValue,
  chosenIndex: number,
): MissionOption | null {
  if (!Array.isArray(parsedOptions)) return null;
  const candidate = parsedOptions[chosenIndex];
  if (!candidate || typeof candidate !== "object") return null;
  const o = candidate as Record<string, unknown>;
  if (
    typeof o.title !== "string" ||
    typeof o.brief !== "string" ||
    typeof o.tip !== "string" ||
    (o.duration !== "short" && o.duration !== "medium" && o.duration !== "long")
  ) {
    return null;
  }
  return {
    title: o.title,
    brief: o.brief,
    tip: o.tip,
    duration: o.duration,
  };
}
