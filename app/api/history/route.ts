import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helper";
import type { TopicId } from "@/lib/missionMatrix";

export type HistoryItem = {
  id: string;
  topic: TopicId;
  level: number;
  /** Snapshot of the chosen mission's title/brief at completion time. */
  title: string | null;
  brief: string | null;
  duration: "short" | "medium" | "long" | null;
  note: string | null;
  photoUrl: string | null;
  completedAt: string;
};

export type HistoryResponse = {
  items: HistoryItem[];
  /** Per-topic totals — useful for the dashboard summary. */
  totalsByTopic: Record<string, number>;
};

export async function GET() {
  const auth = await requireUserId();
  if (auth.response) return auth.response;

  // We don't have a stored snapshot of the chosen option's text on the
  // Completion row, so materialise titles from AiGeneration.parsedOptions
  // at read time. Two queries instead of a join because the FK doesn't
  // have an @relation in the schema (pre-Step 6 design decision —
  // documented in PLAN.md). The cost: one extra Prisma round trip.
  const rows = await prisma.completion.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      topic: true,
      level: true,
      aiGenerationId: true,
      chosenMissionIndex: true,
      note: true,
      photoUrl: true,
      createdAt: true,
    },
  });

  const genIds = Array.from(
    new Set(rows.map((r) => r.aiGenerationId).filter(Boolean) as string[]),
  );
  const generations =
    genIds.length === 0
      ? []
      : await prisma.aiGeneration.findMany({
          where: { id: { in: genIds } },
          select: { id: true, parsedOptions: true },
        });
  const parsedOptionsById = new Map(
    generations.map((g) => [g.id, g.parsedOptions]),
  );

  const items: HistoryItem[] = rows.map((r) => {
    let title: string | null = null;
    let brief: string | null = null;
    let duration: HistoryItem["duration"] = null;

    const opts =
      r.aiGenerationId !== null
        ? parsedOptionsById.get(r.aiGenerationId)
        : null;
    if (Array.isArray(opts) && r.chosenMissionIndex !== null) {
      const chosen = opts[r.chosenMissionIndex];
      if (chosen && typeof chosen === "object") {
        const o = chosen as {
          title?: unknown;
          brief?: unknown;
          duration?: unknown;
        };
        if (typeof o.title === "string") title = o.title;
        if (typeof o.brief === "string") brief = o.brief;
        if (
          o.duration === "short" ||
          o.duration === "medium" ||
          o.duration === "long"
        ) {
          duration = o.duration;
        }
      }
    }

    return {
      id: r.id,
      topic: r.topic as TopicId,
      level: r.level,
      title,
      brief,
      duration,
      note: r.note,
      photoUrl: r.photoUrl,
      completedAt: r.createdAt.toISOString(),
    };
  });

  const totalsByTopic: Record<string, number> = {};
  for (const item of items) {
    totalsByTopic[item.topic] = (totalsByTopic[item.topic] ?? 0) + 1;
  }

  const response: HistoryResponse = { items, totalsByTopic };
  return NextResponse.json(response);
}
