"use client";

import { useEffect, useRef, useState } from "react";
import { getCitySuggestion, updatePreferences } from "@/lib/api-client";

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
        const res = await fetch(`/api/cities?q=${encodeURIComponent(value.trim())}`);
        const data = (await res.json()) as { cities: string[] };
        setSuggestions(data.cities);
        setOpen(data.cities.length > 0);
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
      : "Used to ground your missions in places you can actually visit.";

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-leaf-100">
      <div ref={containerRef} className="relative flex flex-col gap-1">
        <span className="text-sm font-medium text-leaf-700">Your city</span>
        <input
          type="text"
          value={city}
          onChange={handleChange}
          onBlur={onBlur}
          onKeyDown={handleKeyDown}
          placeholder={suggestion ?? "Tell us where you are"}
          autoComplete="off"
          className="rounded-lg border border-leaf-100 px-3 py-2 text-base text-leaf-700 focus:border-leaf-500 focus:outline-none focus:ring-1 focus:ring-leaf-500"
        />
        {open && suggestions.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-leaf-100 bg-white shadow-md">
            {suggestions.map((s, i) => (
              <li
                key={s}
                onMouseDown={() => selectCity(s)}
                className={`cursor-pointer px-3 py-2 text-sm text-leaf-700 ${
                  i === activeIndex ? "bg-leaf-50 font-medium" : "hover:bg-leaf-50"
                }`}
              >
                {s}
              </li>
            ))}
          </ul>
        )}
        <span className={`text-xs font-normal ${saveStatus === "error" ? "text-red-600" : "text-leaf-700/70"}`}>
          {helpText}
        </span>
      </div>
    </section>
  );
}
