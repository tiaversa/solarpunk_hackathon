import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helper";
import { isTopicId, TOPIC_IDS, type TopicId } from "@/lib/missionMatrix";

const Body = z.object({
  topic: z.string().refine(isTopicId, {
    message: `topic must be one of: ${TOPIC_IDS.join(", ")}`,
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

  const progress = await prisma.$transaction(async (tx) => {
    // 1. Abandon any active MissionChoice rows for this topic (any level).
    //    Completion rows are intentionally NOT touched — history sticks.
    await tx.missionChoice.updateMany({
      where: { userId: auth.userId, topic, status: "active" },
      data: { status: "abandoned" },
    });

    // 2. Reset Progress to a fresh start. Upsert so a topic that has no
    //    Progress row yet still gets one (idempotent reset).
    const updated = await tx.progress.upsert({
      where: { userId_topic: { userId: auth.userId, topic } },
      create: { userId: auth.userId, topic },
      update: { currentLevel: 1, completedLevels: [] },
      select: { topic: true, currentLevel: true, completedLevels: true },
    });

    return updated;
  });

  return NextResponse.json({ progress });
}
