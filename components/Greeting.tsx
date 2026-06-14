"use client";

import { useEffect, useState } from "react";

function timeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * "GOOD MORNING VEE" greeting. Prefers the locally-stored display name set at
 * sign-up; falls back to the email local-part passed from the server.
 */
export function Greeting({ fallbackName }: { fallbackName: string }) {
  const [name, setName] = useState(fallbackName);
  const [greeting, setGreeting] = useState("Good morning");

  useEffect(() => {
    setGreeting(timeOfDay());
    try {
      const stored = window.localStorage.getItem("solar.displayName");
      if (stored && stored.trim()) setName(stored.trim());
    } catch {
      // ignore — keep fallback
    }
  }, []);

  return (
    <h1 className="text-3xl font-bold uppercase leading-tight text-solar-sage sm:text-4xl">
      {greeting} {name}
    </h1>
  );
}
