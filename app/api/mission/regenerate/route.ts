import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helper";
import { isTopicId, TOPIC_IDS, type TopicId } from "@/lib/missionMatrix";
import { isLevel, MAX_LEVEL, MIN_LEVEL, type Level } from "@/lib/levels";
import {
  MissionGenerationError,
  regenerateMissions,
} from "@/lib/missions";

const Body = z.object({
  topic: z.string().refine(isTopicId, {
    message: `topic must be one of: ${TOPIC_IDS.join(", ")}`,
  }),
  level: z.number().int().refine(isLevel, {
    message: `level must be an integer ${MIN_LEVEL}-${MAX_LEVEL}`,
  }),
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
  const topic = parsed.data.topic as TopicId;
  const level = parsed.data.level as Level;

  // 1. Retire the prior active generation row(s) so the cache lookup in
  //    GET /api/mission won't return them again.
  await prisma.aiGeneration.updateMany({
    where: { userId: auth.userId, topic, level, status: "active" },
    data: { status: "regenerated" },
  });

  // 2. Abandon any active MissionChoice for this slot. NOTE: this is an
  //    UPDATE, not an INSERT, so the invalidate_pref_summary_on_choice
  //    trigger does NOT fire here. The preference summary cache may
  //    briefly lag until the next INSERT (i.e. the user picks again). If
  //    tighter consistency is needed, add a separate AFTER UPDATE trigger
  //    on MissionChoice for the abandoned status transition.
  await prisma.missionChoice.updateMany({
    where: { userId: auth.userId, topic, level, status: "active" },
    data: { status: "abandoned" },
  });

  // 3. Fresh Claude call with the "vary the angles" hint baked into the
  //    prompt by regenerateMissions().
  try {
    const result = await regenerateMissions({
      userId: auth.userId,
      topic,
      level,
    });
    revalidatePath(`/topic/${topic}`);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof MissionGenerationError) {
      return NextResponse.json(
        { error: err.message, aiGenerationId: err.aiGenerationId },
        { status: 502 },
      );
    }
    throw err;
  }
}
