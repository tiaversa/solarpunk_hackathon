"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  chooseMission,
  completeMission,
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
  isCompleted?: boolean;
  completionNote?: string | null;
  completionPhotoUrl?: string | null;
};

export function MissionList({
  topic,
  level,
  aiGenerationId,
  options,
  initialChosenIndex,
  isCompleted = false,
  completionNote,
  completionPhotoUrl,
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
  // The DOM file input is the source of truth at submit time. Holding a ref
  // means even if React re-renders mid-flow and clears `photoFile` state,
  // we can still read the picked File from the actual <input>. Reduces a
  // class of bugs where the user picks a file and the upload silently no-ops.
  const photoInputRef = useRef<HTMLInputElement | null>(null);

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
      // Prefer the DOM input over React state — see photoInputRef comment.
      // Either source has the same File reference on a happy path; this just
      // guarantees we don't lose the picked file to a stray re-render.
      const file =
        photoInputRef.current?.files?.[0] ?? photoFile ?? null;

      const result = await completeMission({
        topic,
        level,
        aiGenerationId,
        chosenIndex: index,
        note: note.trim() ? note.trim() : undefined,
        photoFile: file,
      });

      // Use a full-page navigation after completion so the browser discards
      // the client-side router cache. router.push() would serve a stale RSC
      // payload the first time the user navigates back to the just-completed
      // level, because Next.js 14's router cache stores the pre-completion
      // state of that URL.
      const nextLevel =
        result.progress.currentLevel <= MAX_LEVEL
          ? result.progress.currentLevel
          : MAX_LEVEL;
      window.location.href = `/topic/${topic}?level=${nextLevel}`;
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
        <p className="rounded-field bg-solar-danger/15 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-4">
        {options.map((opt, i) => {
          const isChosen = chosenIndex === i;
          const isDimmed = chosenIndex !== null && !isChosen;
          return (
            <li
              key={`${aiGenerationId}-${i}`}
              className={`flex flex-col gap-2 rounded-3xl border bg-solar-panel/70 p-5 transition ${
                isChosen
                  ? "border-2 border-solar-green bg-solar-field/40"
                  : isDimmed
                    ? "border-solar-leafmd opacity-55"
                    : "border-solar-leafmd"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-base font-bold text-solar-cream">
                  {i + 1}. {opt.title}
                </h3>
                <span className="shrink-0 rounded-full bg-solar-field px-2.5 py-0.5 text-xs font-bold text-solar-sage ring-1 ring-solar-leafmd">
                  {DURATION_LABEL[opt.duration]}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-solar-sage/90">
                {opt.brief}
              </p>
              <p className="text-xs italic text-solar-sage/70">💡 {opt.tip}</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                {isCompleted && isChosen ? (
                  <span className="text-xs font-bold text-solar-green">
                    ✓ Completed
                  </span>
                ) : isChosen ? (
                  <span className="text-xs font-bold text-solar-sage">
                    ✓ Chosen — ready when you’ve done it
                  </span>
                ) : (
                  <span />
                )}
                {!isCompleted && (
                  <div className="flex gap-2">
                    {isChosen && !showCompletion && (
                      <button
                        type="button"
                        onClick={() => setShowCompletion(true)}
                        disabled={completing}
                        className="rounded-full bg-solar-green px-4 py-1.5 text-sm font-bold text-solar-cream transition hover:bg-solar-moss disabled:opacity-60"
                      >
                        I did this
                      </button>
                    )}
                    {!isChosen && (
                      <button
                        type="button"
                        onClick={() => onChoose(i)}
                        disabled={busyIndex !== null || completing}
                        className="rounded-full bg-solar-green px-4 py-1.5 text-sm font-bold text-solar-cream transition hover:bg-solar-moss disabled:opacity-60"
                      >
                        {busyIndex === i
                          ? "Saving…"
                          : chosenIndex !== null
                            ? "Switch to this"
                            : "Choose this quest"}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {isCompleted && isChosen && (
                <div className="mt-2 flex flex-col gap-2 rounded-2xl border border-solar-leafmd bg-solar-field/40 p-3">
                  {completionNote && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-solar-sage">
                        Your reflection
                      </span>
                      <p className="text-sm leading-relaxed text-solar-sage/90">
                        {completionNote}
                      </p>
                    </div>
                  )}
                  {completionPhotoUrl && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-solar-sage">
                        Your photo
                      </span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={completionPhotoUrl}
                        alt="Quest completion photo"
                        className="max-h-64 w-full rounded-lg object-cover"
                      />
                    </div>
                  )}
                </div>
              )}

              {!isCompleted && isChosen && showCompletion && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onComplete(i);
                  }}
                  className="mt-2 flex flex-col gap-3 rounded-2xl border border-solar-leafmd bg-solar-field/40 p-3"
                >
                  <label className="flex flex-col gap-1 text-xs font-bold text-solar-sage">
                    Reflection (optional)
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder="What happened? What surprised you?"
                      className="rounded-2xl border-2 border-solar-green/40 bg-solar-bg/50 px-3 py-2 text-sm font-normal text-solar-sage placeholder:text-solar-sage/40 focus:border-solar-green focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-bold text-solar-sage">
                    Photo (optional)
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        setPhotoFile(e.target.files?.[0] ?? null)
                      }
                      className="mt-1 text-xs font-normal text-solar-sage file:mr-3 file:rounded-full file:border-0 file:bg-solar-green/20 file:px-3 file:py-1 file:text-solar-sage"
                    />
                    {photoFile && (
                      <span className="flex items-center gap-2 text-[11px] font-normal text-solar-sage/80">
                        <span>
                          Selected: <strong>{photoFile.name}</strong> (
                          {(photoFile.size / 1024).toFixed(1)} KB)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setPhotoFile(null);
                            if (photoInputRef.current) {
                              photoInputRef.current.value = "";
                            }
                          }}
                          className="text-solar-green underline underline-offset-2 hover:no-underline"
                        >
                          Remove
                        </button>
                      </span>
                    )}
                  </label>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCompletion(false);
                        setNote("");
                        setPhotoFile(null);
                        if (photoInputRef.current) {
                          photoInputRef.current.value = "";
                        }
                      }}
                      disabled={completing}
                      className="rounded-full px-4 py-1.5 text-sm font-bold text-solar-sage hover:text-solar-green disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={completing}
                      className="rounded-full bg-solar-green px-4 py-1.5 text-sm font-bold text-solar-cream hover:bg-solar-moss disabled:opacity-60"
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
