import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helper";
import { isTopicId, TOPIC_IDS } from "@/lib/missionMatrix";

// GET /api/progress -> [{ topic, currentLevel, completedLevels }]
export async function GET() {
  const auth = await requireUserId();
  if (auth.response) return auth.response;

  const rows = await prisma.progress.findMany({
    where: { userId: auth.userId },
    select: { topic: true, currentLevel: true, completedLevels: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(rows);
}

const PostBody = z.object({
  topic: z.string().refine(isTopicId, {
    message: `topic must be one of: ${TOPIC_IDS.join(", ")}`,
  }),
});

// POST /api/progress { topic } -> { topic, currentLevel: 1, completedLevels: [] }
// Idempotent: if the row already exists, returns it unchanged.
export async function POST(req: Request) {
  const auth = await requireUserId();
  if (auth.response) return auth.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PostBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  // Upsert keeps this idempotent — repeated POSTs return the existing row
  // instead of erroring on the (userId, topic) unique constraint.
  const row = await prisma.progress.upsert({
    where: { userId_topic: { userId: auth.userId, topic: parsed.data.topic } },
    create: { userId: auth.userId, topic: parsed.data.topic },
    update: {},
    select: { topic: true, currentLevel: true, completedLevels: true },
  });

  return NextResponse.json(row, { status: 201 });
}
