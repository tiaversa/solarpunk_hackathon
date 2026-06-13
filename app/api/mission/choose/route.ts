import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helper";
import { isTopicId, TOPIC_IDS, type TopicId } from "@/lib/missionMatrix";
import { isLevel, MAX_LEVEL, MIN_LEVEL, type Level } from "@/lib/levels";
import { MISSION_OPTIONS_COUNT } from "@/lib/missions";

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

    return NextResponse.json({
      missionChoiceId: row.id,
      status: row.status,
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
