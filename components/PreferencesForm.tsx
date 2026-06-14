"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ApiError, updatePreferences } from "@/lib/api-client";

type Duration = "short" | "medium" | "long";

type Props = {
  initialInterests: string[];
  initialPreferredDuration: Duration | null;
};

const DURATION_OPTIONS: Array<{ value: Duration | "any"; label: string }> = [
  { value: "any", label: "No preference" },
  { value: "short", label: "Short (under 30 min)" },
  { value: "medium", label: "Medium (30–90 min)" },
  { value: "long", label: "Long (half-day+)" },
];

export function PreferencesForm({
  initialInterests,
  initialPreferredDuration,
}: Props) {
  const router = useRouter();
  const [interestsText, setInterestsText] = useState(
    initialInterests.join(", "),
  );
  const [duration, setDuration] = useState<Duration | "any">(
    initialPreferredDuration ?? "any",
  );
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const interests = interestsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await updatePreferences({
        interests,
        preferredDuration: duration === "any" ? null : duration,
      });
      setSavedAt(Date.now());
      startTransition(() => router.refresh());
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not save your preferences.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-5 rounded-field border border-solar-leafmd bg-solar-panel/60 p-6"
    >
      <label className="flex flex-col gap-2 text-sm uppercase tracking-wide text-solar-sage">
        Interests
        <input
          type="text"
          value={interestsText}
          onChange={(e) => setInterestsText(e.target.value)}
          placeholder="fermentation, foraging, bicycle repair"
          className="w-full rounded-field border-2 border-solar-green/40 bg-solar-field/50 px-4 py-3 text-base normal-case tracking-normal text-solar-sage placeholder:text-solar-sage/40 focus:border-solar-green focus:outline-none"
        />
        <span className="text-xs normal-case tracking-normal text-solar-sage/60">
          Comma-separated. Up to 20 tags — they make your quests feel
          personalised.
        </span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm uppercase tracking-wide text-solar-sage">
          Preferred quest length
        </legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {DURATION_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`cursor-pointer rounded-full border px-4 py-1.5 text-xs font-bold transition ${
                duration === opt.value
                  ? "border-solar-green bg-solar-green/20 text-solar-cream"
                  : "border-solar-leafmd text-solar-sage/80 hover:border-solar-green"
              }`}
            >
              <input
                type="radio"
                name="duration"
                value={opt.value}
                checked={duration === opt.value}
                onChange={() => setDuration(opt.value)}
                className="sr-only"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p className="rounded-field bg-solar-danger/15 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      {savedAt && !error && (
        <p className="rounded-field bg-solar-green/15 px-3 py-2 text-sm text-solar-sage ring-1 ring-solar-green/40">
          Saved. Your next set of quests will use these preferences.
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-full bg-solar-green px-5 py-2.5 text-sm font-bold text-solar-cream hover:bg-solar-moss disabled:opacity-60"
      >
        {submitting ? "Saving…" : "Save preferences"}
      </button>
    </form>
  );
}
