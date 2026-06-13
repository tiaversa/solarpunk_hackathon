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
      className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-leaf-100"
    >
      <label className="flex flex-col gap-1 text-sm font-medium text-leaf-700">
        Interests
        <input
          type="text"
          value={interestsText}
          onChange={(e) => setInterestsText(e.target.value)}
          placeholder="fermentation, foraging, bicycle repair"
          className="rounded-lg border border-leaf-100 px-3 py-2 text-base text-leaf-700 focus:border-leaf-500 focus:outline-none focus:ring-1 focus:ring-leaf-500"
        />
        <span className="text-xs font-normal text-leaf-700/70">
          Comma-separated. Up to 20 tags. We pass them to Claude so missions
          feel personalised.
        </span>
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium text-leaf-700">
          Preferred mission length
        </legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {DURATION_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                duration === opt.value
                  ? "border-leaf-600 bg-leaf-100 text-leaf-700"
                  : "border-leaf-100 text-leaf-700/80 hover:border-leaf-500"
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
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {savedAt && !error && (
        <p className="rounded-lg bg-leaf-100 px-3 py-2 text-sm text-leaf-700">
          Saved. Your next set of missions will use these preferences.
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-lg bg-leaf-600 px-4 py-2 text-sm font-semibold text-white hover:bg-leaf-700 disabled:opacity-60"
      >
        {submitting ? "Saving…" : "Save preferences"}
      </button>
    </form>
  );
}
