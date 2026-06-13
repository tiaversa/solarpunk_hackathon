"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  chooseMission,
  completeMission,
  uploadPhoto,
  type MissionOption,
} from "@/lib/api-client";
import type { TopicId } from "@/lib/missionMatrix";
import { MAX_LEVEL } from "@/lib/levels";

const DURATION_LABEL: Record<MissionOption["duration"], string> = {
  short: "under 30 min",
  medium: "30–90 min",
  long: "half-day+",
};

type Props = {
  topic: TopicId;
  level: number;
  aiGenerationId: string;
  options: MissionOption[];
  initialChosenIndex: number | null;
};

export function MissionList({
  topic,
  level,
  aiGenerationId,
  options,
  initialChosenIndex,
}: Props) {
  const router = useRouter();
  const [chosenIndex, setChosenIndex] = useState<number | null>(
    initialChosenIndex,
  );
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Completion form state — shown only on the chosen card.
  const [showCompletion, setShowCompletion] = useState(false);
  const [note, setNote] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [completing, setCompleting] = useState(false);

  async function onChoose(index: number) {
    if (busyIndex !== null) return;
    setBusyIndex(index);
    setError(null);
    try {
      await chooseMission({
        topic,
        level,
        aiGenerationId,
        chosenIndex: index,
      });
      setChosenIndex(index);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not save your choice.",
      );
    } finally {
      setBusyIndex(null);
    }
  }

  async function onComplete(index: number) {
    if (completing) return;
    setCompleting(true);
    setError(null);
    try {
      let photoBase64: string | undefined;
      if (photoFile) photoBase64 = await uploadPhoto(photoFile);

      const result = await completeMission({
        topic,
        level,
        aiGenerationId,
        chosenIndex: index,
        note: note.trim() ? note.trim() : undefined,
        photoBase64,
      });

      // Refresh server data so the level pill and topic grid catch up,
      // then jump to the next level (or stay at 6 — the "Teach" cap).
      startTransition(() => router.refresh());
      const nextLevel =
        result.progress.currentLevel <= MAX_LEVEL
          ? result.progress.currentLevel
          : MAX_LEVEL;
      router.push(`/topic/${topic}?level=${nextLevel}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not save completion.",
      );
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {options.map((opt, i) => {
          const isChosen = chosenIndex === i;
          const isDimmed = chosenIndex !== null && !isChosen;
          return (
            <li
              key={`${aiGenerationId}-${i}`}
              className={`flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm ring-1 transition ${
                isChosen
                  ? "ring-2 ring-leaf-600"
                  : isDimmed
                    ? "opacity-60 ring-leaf-100"
                    : "ring-leaf-100"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-base font-semibold text-leaf-700">
                  {i + 1}. {opt.title}
                </h3>
                <span className="shrink-0 rounded-full bg-leaf-100 px-2 py-0.5 text-xs font-medium text-leaf-700">
                  {opt.duration} · {DURATION_LABEL[opt.duration]}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-leaf-700/90">
                {opt.brief}
              </p>
              <p className="text-xs italic text-leaf-700/70">💡 {opt.tip}</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                {isChosen ? (
                  <span className="text-xs font-semibold text-leaf-700">
                    ✓ Chosen — ready when you’ve done it
                  </span>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  {isChosen && !showCompletion && (
                    <button
                      type="button"
                      onClick={() => setShowCompletion(true)}
                      disabled={completing}
                      className="rounded-lg bg-leaf-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-leaf-700 disabled:opacity-60"
                    >
                      I did this
                    </button>
                  )}
                  {!isChosen && (
                    <button
                      type="button"
                      onClick={() => onChoose(i)}
                      disabled={busyIndex !== null || completing}
                      className="rounded-lg bg-leaf-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-leaf-700 disabled:opacity-60"
                    >
                      {busyIndex === i
                        ? "Saving…"
                        : chosenIndex !== null
                          ? "Switch to this"
                          : "Choose this mission"}
                    </button>
                  )}
                </div>
              </div>

              {isChosen && showCompletion && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onComplete(i);
                  }}
                  className="mt-2 flex flex-col gap-2 rounded-xl bg-leaf-50 p-3"
                >
                  <label className="flex flex-col gap-1 text-xs font-medium text-leaf-700">
                    Reflection (optional)
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder="What happened? What surprised you?"
                      className="rounded-lg border border-leaf-100 px-3 py-2 text-sm text-leaf-700 focus:border-leaf-500 focus:outline-none focus:ring-1 focus:ring-leaf-500"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-leaf-700">
                    Photo (optional)
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        setPhotoFile(e.target.files?.[0] ?? null)
                      }
                      className="text-xs text-leaf-700"
                    />
                    <span className="text-[10px] font-normal text-leaf-700/60">
                      Requires <code>CLOUDINARY_URL</code> in <code>.env</code>.
                      Without it, just leave this empty.
                    </span>
                  </label>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCompletion(false);
                        setNote("");
                        setPhotoFile(null);
                      }}
                      disabled={completing}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-leaf-700 hover:underline disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={completing}
                      className="rounded-lg bg-leaf-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-leaf-700 disabled:opacity-60"
                    >
                      {completing ? "Saving…" : "Complete & unlock next"}
                    </button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
