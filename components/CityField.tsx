"use client";

import { useEffect, useRef, useState } from "react";
import {
  getCitySuggestion,
  searchCities,
  updatePreferences,
} from "@/lib/api-client";

type Props = { initialCity: string };

export function CityField({ initialCity }: Props) {
  const [city, setCity] = useState(initialCity);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const savedRef = useRef(initialCity);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
    return () => { cancelled = true; };
  }, [initialCity]);

  // Close dropdown when clicking outside.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function fetchSuggestions(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const cities = await searchCities(value);
        setSuggestions(cities);
        setOpen(cities.length > 0);
        setActiveIndex(-1);
      } catch {
        // Best-effort — ignore network errors.
      }
    }, 250);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setCity(e.target.value);
    fetchSuggestions(e.target.value);
  }

  function selectCity(value: string) {
    setCity(value);
    setOpen(false);
    setSuggestions([]);
    void save(value);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectCity(suggestions[activeIndex]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

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

  async function onBlur() {
    // Small delay so a click on a suggestion registers before blur fires.
    setTimeout(() => {
      setOpen(false);
      void save(city);
    }, 150);
  }

  const helpText =
    saveStatus === "saving" ? "Saving…" :
    saveStatus === "saved"  ? "✓ Saved" :
    saveStatus === "error"  ? "Could not save. Try again." :
    suggestion && !initialCity
      ? `Suggested from your location: ${suggestion}. Edit if it's wrong.`
      : "Used to ground your quests in places you can actually visit.";

  return (
    <section className="rounded-field border border-solar-leafmd bg-solar-panel/60 p-4">
      <div ref={containerRef} className="relative flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wide text-solar-sage">
          Your city
        </span>
        <input
          type="text"
          value={city}
          onChange={handleChange}
          onBlur={onBlur}
          onKeyDown={handleKeyDown}
          placeholder={suggestion ?? "Tell us where you are"}
          autoComplete="off"
          className="w-full rounded-field border-2 border-solar-green/40 bg-solar-field/50 px-4 py-2.5 text-base text-solar-sage placeholder:text-solar-sage/40 focus:border-solar-green focus:outline-none"
        />
        {open && suggestions.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-2xl border border-solar-leafmd bg-solar-panel shadow-lg shadow-black/40">
            {suggestions.map((s, i) => (
              <li
                key={s}
                onMouseDown={() => selectCity(s)}
                className={`cursor-pointer px-4 py-2 text-sm text-solar-sage ${
                  i === activeIndex
                    ? "bg-solar-field font-bold"
                    : "hover:bg-solar-field/60"
                }`}
              >
                {s}
              </li>
            ))}
          </ul>
        )}
        <span
          className={`text-xs ${saveStatus === "error" ? "text-red-300" : "text-solar-sage/60"}`}
        >
          {helpText}
        </span>
      </div>
    </section>
  );
}
