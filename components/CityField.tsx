"use client";

import { useEffect, useState } from "react";
import { getCitySuggestion } from "@/lib/api-client";

type Props = { initialCity: string };

/**
 * Editable city field for the home page.
 *
 * On mount: if the user has no city saved, ask the server for an IP-derived
 * suggestion (Step 3 of the spec) and pre-fill the input with it. The user
 * can always override the value. Saving the city is wired up later — for
 * now we just hold the value locally.
 */
export function CityField({ initialCity }: Props) {
  const [city, setCity] = useState(initialCity);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  useEffect(() => {
    if (initialCity) return;
    let cancelled = false;
    void getCitySuggestion()
      .then(({ city: suggested }) => {
        if (cancelled || !suggested) return;
        setSuggestion(suggested);
        setCity((current) => current || suggested);
      })
      .catch(() => {
        // Geolocation is best-effort.
      });
    return () => {
      cancelled = true;
    };
  }, [initialCity]);

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-leaf-100">
      <label className="flex flex-col gap-1 text-sm font-medium text-leaf-700">
        Your city
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder={suggestion ?? "Tell us where you are"}
          className="rounded-lg border border-leaf-100 px-3 py-2 text-base text-leaf-700 focus:border-leaf-500 focus:outline-none focus:ring-1 focus:ring-leaf-500"
        />
        <span className="text-xs font-normal text-leaf-700/70">
          {suggestion && !initialCity
            ? `Suggested from your location: ${suggestion}. Edit if it’s wrong.`
            : "Used to ground your missions in places you can actually visit."}
        </span>
      </label>
    </section>
  );
}
