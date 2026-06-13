import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helper";
import { isTopicId, TOPIC_IDS, type TopicId } from "@/lib/missionMatrix";
import {
  isLevel,
  MAX_LEVEL,
  MIN_LEVEL,
  type Level,
} from "@/lib/levels";
import {
  getOrGenerateMission,
  MISSION_OPTIONS_COUNT,
} from "@/lib/missions";

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
  note: z.string().max(2_000).optional(),
  // Bucket-relative path returned by POST /api/photo/upload-url after a
  // successful direct-to-Supabase upload. We validate below that the
  // path actually belongs to this user before persisting.
  photoPath: z.string().max(500).optional(),
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
  const { aiGenerationId, chosenIndex, note, photoPath } = parsed.data;
  const topic = parsed.data.topic as TopicId;
  const level = parsed.data.level as Level;

  // Defence-in-depth: even though the upload-URL route mints paths of the
  // form `{userId}/{uuid}.jpg`, a client could try to submit any string
  // here. Reject paths that don't start with the caller's userId folder so
  // a photo row can never reference another user's object.
  if (photoPath && !photoPath.startsWith(`${auth.userId}/`)) {
    return NextResponse.json(
      { error: "photoPath must live under your own folder" },
      { status: 400 },
    );
  }

  // Confirm the generation row belongs to this user and matches the
  // (topic, level) — same defensive check as POST /api/mission/choose.
  const generation = await prisma.aiGeneration.findFirst({
    where: {
      id: aiGenerationId,
      userId: auth.userId,
      topic,
      level,
    },
    select: { id: true },
  });
  if (!generation) {
    return NextResponse.json(
      { error: "Unknown aiGenerationId for that (topic, level)" },
      { status: 404 },
    );
  }

  // All DB writes go inside a transaction so a crash between steps cannot
  // leave Progress and MissionChoice in a mismatched state. The photo
  // upload happened separately (browser → Supabase) before this request
  // landed, so there's no external call left to fail mid-transaction.
  const updatedProgress = await prisma.$transaction(async (tx) => {
    // a. INSERT into Completion
    await tx.completion.create({
      data: {
        userId: auth.userId,
        topic,
        level,
        aiGenerationId,
        chosenMissionIndex: chosenIndex,
        photoPath: photoPath ?? null,
        note: note ?? null,
      },
      select: { id: true },
    });

    // b. UPDATE MissionChoice: any active row for (user, topic, level)
    //    becomes 'completed'. Zero rows is fine — caller may have
    //    completed without first calling /api/mission/choose.
    await tx.missionChoice.updateMany({
      where: {
        userId: auth.userId,
        topic,
        level,
        status: "active",
      },
      data: { status: "completed" },
    });

    // c. UPDATE Progress: append level to completedLevels (de-duped); if
    //    level < 6 advance currentLevel = level + 1; if level === 6
    //    leave it at 6 so the LEVELS constant lookup never goes out of
    //    range.
    const current = await tx.progress.upsert({
      where: { userId_topic: { userId: auth.userId, topic } },
      create: { userId: auth.userId, topic },
      update: {},
      select: { completedLevels: true },
    });

    const completedLevels = current.completedLevels.includes(level)
      ? current.completedLevels
      : [...current.completedLevels, level].sort((a, b) => a - b);
    const currentLevel = level < MAX_LEVEL ? ((level + 1) as Level) : MAX_LEVEL;

    const updated = await tx.progress.update({
      where: { userId_topic: { userId: auth.userId, topic } },
      data: { currentLevel, completedLevels },
      select: { topic: true, currentLevel: true, completedLevels: true },
    });

    return updated;
  });

  // Step 8 — pre-cache the next level's missions while the user is still
  // on this page. Fire-and-forget: never block the response, never throw
  // an unhandled rejection. getOrGenerateMission is idempotent — if a row
  // for level+1 already exists (e.g. user briefly visited that level
  // earlier) it just no-ops via the cache check.
  if (level < MAX_LEVEL) {
    const nextLevel = (level + 1) as Level;
    void getOrGenerateMission({
      userId: auth.userId,
      topic,
      level: nextLevel,
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[pre-cache] level ${nextLevel} for ${topic} failed: ${msg}`,
      );
    });
  }

  // Invalidate the server cache for this topic page so the next navigation
  // (router.push to the next level) always fetches fresh progress data.
  revalidatePath(`/topic/${topic}`);

  return NextResponse.json({ progress: updatedProgress });
}
