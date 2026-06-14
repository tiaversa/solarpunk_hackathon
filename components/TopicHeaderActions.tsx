"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  regenerateMission,
  resetTopic,
} from "@/lib/api-client";
import { getCoords } from "@/lib/gps";
import type { TopicId } from "@/lib/missionMatrix";

type Props = {
  topic: TopicId;
  level: number;
  canRegenerate: boolean;
  onReloadMissions?: () => void;
};


export function TopicHeaderActions({ topic, level, canRegenerate, onReloadMissions }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<null | "regen" | "reset">(null);
  const [error, setError] = useState<string | null>(null);

  async function onRegenerate() {
    if (busy) return;
    setBusy("regen");
    setError(null);
    try {
      const coords = await getCoords();
      await regenerateMission(topic, level, coords);
      if (onReloadMissions) {
        onReloadMissions();
      } else {
        startTransition(() => router.refresh());
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not regenerate quests.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function onReset() {
    if (busy) return;
    if (
      !window.confirm(
        `Reset your progress on this topic to level 1? Your completion history will be preserved, but any active quest will be abandoned.`,
      )
    ) {
      return;
    }
    setBusy("reset");
    setError(null);
    try {
      await resetTopic(topic);
      startTransition(() => router.refresh());
      router.push(`/topic/${topic}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not reset topic.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onRegenerate}
          disabled={!canRegenerate || busy !== null}
          title={
            canRegenerate
              ? "Get 3 different quest options for this level"
              : "Wait until the current set has loaded"
          }
          className="rounded-full border-2 border-solar-green px-4 py-1.5 text-xs font-bold text-solar-sage transition hover:bg-solar-green/15 disabled:opacity-50"
        >
          {busy === "regen" ? "Regenerating…" : "↻ Regenerate"}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={busy !== null}
          className="rounded-full border border-solar-danger/70 px-4 py-1.5 text-xs font-bold text-red-300 transition hover:bg-solar-danger/15 disabled:opacity-50"
        >
          {busy === "reset" ? "Resetting…" : "Reset topic"}
        </button>
      </div>
      {error && (
        <p className="rounded-field bg-solar-danger/15 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
