"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  createProgress,
  type ProgressRow,
} from "@/lib/api-client";
import { TOPICS, type TopicId } from "@/lib/missionMatrix";
import { LEVELS, type Level, levelLabel } from "@/lib/levels";

// After picking / opening a topic, jump straight to the mission viewer
// so the user can see the 3 generated options.

type Props = {
  progressByTopic: Partial<
    Record<TopicId, { currentLevel: Level; completedLevels: number[] }>
  >;
};

export function TopicGrid({ progressByTopic }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState<TopicId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localProgress, setLocalProgress] = useState(progressByTopic);

  async function onPick(topic: TopicId) {
    if (picking) return;
    setPicking(topic);
    setError(null);

    let row: ProgressRow;
    try {
      row = await createProgress(topic);
    } catch (err) {
      setPicking(null);
      setError(
        err instanceof ApiError ? err.message : "Could not start that topic.",
      );
      return;
    }

    setLocalProgress((prev) => ({
      ...prev,
      [topic]: {
        currentLevel: row.currentLevel as Level,
        completedLevels: row.completedLevels,
      },
    }));

    // Refresh server-rendered data and navigate into the topic viewer.
    startTransition(() => {
      router.refresh();
      router.push(`/topic/${topic}`);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TOPICS.map((topic) => {
          const p = localProgress[topic.id];
          const isPicking = picking === topic.id || (pending && p);
          return (
            <li key={topic.id}>
              <button
                type="button"
                onClick={() => onPick(topic.id)}
                disabled={Boolean(picking)}
                className="flex h-full w-full flex-col items-start gap-2 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-leaf-100 transition hover:ring-leaf-500 disabled:cursor-progress disabled:opacity-70"
              >
                <span className="text-3xl" aria-hidden="true">
                  {topic.emoji}
                </span>
                <span className="text-lg font-semibold text-leaf-700">
                  {topic.label}
                </span>
                {p ? (
                  <span className="text-xs font-medium text-leaf-600">
                    Level {p.currentLevel} · {levelLabel(p.currentLevel)} ·{" "}
                    {p.completedLevels.length}/6 complete
                  </span>
                ) : (
                  <span className="text-xs text-leaf-700/60">
                    Not started — tap to begin at level 1 · {LEVELS[1]}
                  </span>
                )}
                {isPicking && (
                  <span className="text-xs text-leaf-700/60">Saving…</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
