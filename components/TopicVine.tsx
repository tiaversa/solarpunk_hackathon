"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ApiError, createProgress, type ProgressRow } from "@/lib/api-client";
import { TOPICS, type TopicId } from "@/lib/missionMatrix";
import { type Level } from "@/lib/levels";
import { MAX_LEVEL } from "@/lib/levels";
import { PlantVine, type VineNode, type VineState } from "@/components/PlantVine";

type Props = {
  progressByTopic: Partial<
    Record<TopicId, { currentLevel: Level; completedLevels: number[] }>
  >;
};

export function TopicVine({ progressByTopic }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState<TopicId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localProgress, setLocalProgress] = useState(progressByTopic);

  async function onPick(topic: TopicId) {
    if (picking) return;
    const existing = localProgress[topic];

    // Already started — go straight in, no write needed.
    if (existing) {
      startTransition(() => router.push(`/topic/${topic}`));
      return;
    }

    setPicking(topic);
    setError(null);
    let row: ProgressRow | null;
    try {
      row = await createProgress(topic);
    } catch (err) {
      setPicking(null);
      setError(
        err instanceof ApiError ? err.message : "Could not start that topic.",
      );
      return;
    }
    if (row) {
      setLocalProgress((prev) => ({
        ...prev,
        [topic]: {
          currentLevel: row!.currentLevel as Level,
          completedLevels: row!.completedLevels,
        },
      }));
    }
    startTransition(() => {
      router.refresh();
      router.push(`/topic/${topic}`);
    });
  }

  const nodes: VineNode[] = TOPICS.map((topic) => {
    const p = localProgress[topic.id];
    let state: VineState = "upcoming";
    if (p) {
      state =
        p.completedLevels.length >= MAX_LEVEL ? "done" : "active";
    }
    return {
      key: topic.id,
      label: topic.label,
      icon: topic.emoji,
      state,
      onClick: () => onPick(topic.id),
      disabled: Boolean(picking) && picking !== topic.id,
    } satisfies VineNode;
  });

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="rounded-field bg-solar-danger/15 px-4 py-3 text-center text-sm text-red-300 ring-1 ring-solar-danger/40">
          {error}
        </p>
      )}
      <PlantVine nodes={nodes} spacing={66} />
      {(picking || pending) && (
        <p className="text-center text-xs text-solar-sage/70">Opening topic…</p>
      )}
    </div>
  );
}
