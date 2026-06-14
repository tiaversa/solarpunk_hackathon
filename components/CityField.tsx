"use client";

import { useEffect, useRef, useState } from "react";
import { getCitySuggestion, updatePreferences } from "@/lib/api-client";
import { CityCombobox } from "@/components/CityCombobox";

type Props = { initialCity: string };

export function CityField({ initialCity }: Props) {
  const [city, setCity] = useState(initialCity);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const savedRef = useRef(initialCity);

  // IP-based suggestion on first load when no city is saved.
  useEffect(() => {
    if (initialCity) return;
    let cancelled = false;
    void getCitySuggestion()
      .then(({ city: suggested }) => {
        if (cancelled || !suggested) return;
        setSuggestion(suggested);
        setCity((current) => current || suggested);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialCity]);

  async function save(value: string) {
    const trimmed = value.trim();
    if (trimmed === savedRef.current) return;
    setSaveStatus("saving");
    try {
      await updatePreferences({ city: trimmed });
      savedRef.current = trimmed;
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    }
  }

  function handleChange(value: string) {
    setCity(value);
  }

  function handleBlur() {
    void save(city);
  }

  const helpText =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "saved"
        ? "✓ Saved"
        : saveStatus === "error"
          ? "Could not save. Try again."
          : suggestion && !initialCity
            ? `Suggested from your location: ${suggestion}. Edit if it's wrong.`
            : "Used to ground your missions in places you can actually visit.";

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-leaf-100">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-leaf-700">Your city</span>
        {/* CityCombobox handles the dropdown; we intercept blur for auto-save */}
        <div onBlur={handleBlur}>
          <CityCombobox
            value={city}
            onChange={handleChange}
            placeholder={suggestion ?? "Tell us where you are"}
          />
        </div>
        <span
          className={`text-xs font-normal ${saveStatus === "error" ? "text-red-600" : "text-leaf-700/70"}`}
        >
          {helpText}
        </span>
      </div>
    </section>
  );
}
