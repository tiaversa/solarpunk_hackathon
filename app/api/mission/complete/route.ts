import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helper";
import {
  CloudinaryNotConfiguredError,
  CloudinaryUploadError,
  uploadPhotoBase64,
} from "@/lib/cloudinary";
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
  photoBase64: z.string().optional(),
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
  const { aiGenerationId, chosenIndex, note, photoBase64 } = parsed.data;
  const topic = parsed.data.topic as TopicId;
  const level = parsed.data.level as Level;

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

  // Upload photo BEFORE the transaction. Cloudinary is external and can't
  // be rolled back if a later DB write fails — we'd rather orphan a CDN
  // file than leave Progress and MissionChoice in a mismatched state.
  let photoUrl: string | null = null;
  if (photoBase64) {
    try {
      photoUrl = await uploadPhotoBase64(photoBase64);
    } catch (err) {
      if (err instanceof CloudinaryNotConfiguredError) {
        return NextResponse.json(
          {
            error:
              "Photo uploads aren’t configured yet. Set CLOUDINARY_URL in .env, or submit without a photo.",
          },
          { status: 503 },
        );
      }
      if (err instanceof CloudinaryUploadError) {
        return NextResponse.json({ error: err.message }, { status: 502 });
      }
      throw err;
    }
  }

  // All DB writes go inside a transaction so a crash between steps cannot
  // leave Progress and MissionChoice in a mismatched state.
  const updatedProgress = await prisma.$transaction(async (tx) => {
    // a. INSERT into Completion
    await tx.completion.create({
      data: {
        userId: auth.userId,
        topic,
        level,
        aiGenerationId,
        chosenMissionIndex: chosenIndex,
        photoUrl,
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

  return NextResponse.json({ progress: updatedProgress });
}
