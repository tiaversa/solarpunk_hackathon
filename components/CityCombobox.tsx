"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (city: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
};

/**
 * Controlled city input with autocomplete suggestions from /api/cities.
 * Owns no server-save logic — just calls `onChange` when a city is selected or
 * typed. Use CityField (which wraps this) when you need auto-save to preferences.
 */
export function CityCombobox({
  value,
  onChange,
  placeholder = "Start typing a city…",
  required = false,
  className = "",
}: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function fetchSuggestions(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cities?q=${encodeURIComponent(q.trim())}`);
        const data = (await res.json()) as { cities: string[] };
        setSuggestions(data.cities);
        setOpen(data.cities.length > 0);
        setActiveIndex(-1);
      } catch {
        // best-effort
      }
    }, 250);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
    fetchSuggestions(e.target.value);
  }

  function selectCity(city: string) {
    onChange(city);
    setOpen(false);
    setSuggestions([]);
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

  const inputClass =
    "rounded-lg border border-leaf-100 px-3 py-2 text-base text-leaf-700 focus:border-leaf-500 focus:outline-none focus:ring-1 focus:ring-leaf-500 w-full";

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className={inputClass}
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
    </div>
  );
}
