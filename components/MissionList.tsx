"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  chooseMission,
  completeMission,
  type CityResourcePlace,
  type MissionOption,
} from "@/lib/api-client";
import type { TopicId } from "@/lib/missionMatrix";
import { MAX_LEVEL } from "@/lib/levels";

const DURATION_LABEL: Record<MissionOption["duration"], string> = {
  short: "under 30 min",
  medium: "30–90 min",
  long: "half-day+",
};

// How many CityResources places we surface under the chosen card.
// Decoupled from MAX_PLACES_PER_LOOKUP in lib/cityResources.ts (which
// controls how many we *cache*) so we can later show 5 by default and
// add a "see more" affordance without touching the cache layer.
const MAX_PLACES_TO_SHOW = 5;

type Props = {
  topic: TopicId;
  level: number;
  aiGenerationId: string;
  options: MissionOption[];
  initialChosenIndex: number | null;
  isCompleted?: boolean;
  /**
   * Solarpunk-aligned local places for this user's (city, topic),
   * loaded from CityResources on the server. Empty array when the
   * user hasn't set a city, OSM was unreachable when they picked, or
   * we genuinely found nothing nearby. The UI hides the section in
   * all empty cases — silent absence is less misleading than a
   * "no places found" notice.
   */
  cityPlaces?: CityResourcePlace[];
  completionNote?: string | null;
  completionPhotoUrl?: string | null;
};

function osmUrl(p: CityResourcePlace): string {
  return `https://www.openstreetmap.org/${p.osmType}/${p.osmId}`;
}

export function MissionList({
  topic,
  level,
  aiGenerationId,
  options,
  initialChosenIndex,
  isCompleted = false,
  cityPlaces = [],
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
                {isCompleted && isChosen ? (
                  <span className="text-xs font-semibold text-leaf-600">
                    ✓ Completed
                  </span>
                ) : isChosen ? (
                  <span className="text-xs font-semibold text-leaf-700">
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
                )}
              </div>

              {!isCompleted && isChosen && cityPlaces.length > 0 && (
                <div className="mt-2 flex flex-col gap-2 rounded-xl bg-leaf-50 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-leaf-700">
                      Places nearby that fit this mission
                    </span>
                    <span className="text-[10px] text-leaf-700/60">
                      via OpenStreetMap
                    </span>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {cityPlaces.slice(0, MAX_PLACES_TO_SHOW).map((p) => (
                      <li
                        key={`${p.osmType}-${p.osmId}`}
                        className="flex flex-col gap-0.5 rounded-lg bg-white p-2 ring-1 ring-leaf-100"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <a
                            href={osmUrl(p)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold text-leaf-700 hover:underline"
                          >
                            {p.name}
                          </a>
                          <span className="shrink-0 rounded-full bg-leaf-100 px-2 py-0.5 text-[10px] font-medium text-leaf-700">
                            {p.category}
                          </span>
                        </div>
                        {p.address && (
                          <span className="text-xs text-leaf-700/70">
                            {p.address}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {isCompleted && isChosen && (
                <div className="mt-2 flex flex-col gap-2 rounded-xl bg-leaf-50 p-3">
                  {completionNote && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-leaf-700">
                        Your reflection
                      </span>
                      <p className="text-sm leading-relaxed text-leaf-700/90">
                        {completionNote}
                      </p>
                    </div>
                  )}
                  {completionPhotoUrl && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-leaf-700">
                        Your photo
                      </span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={completionPhotoUrl}
                        alt="Mission completion photo"
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
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        setPhotoFile(e.target.files?.[0] ?? null)
                      }
                      className="text-xs text-leaf-700"
                    />
                    {photoFile && (
                      <span className="flex items-center gap-2 text-[11px] font-normal text-leaf-700/80">
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
                          className="text-leaf-700 underline underline-offset-2 hover:no-underline"
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
