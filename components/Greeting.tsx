"use client";

import { useEffect, useState } from "react";

function timeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function Greeting() {
  const [greeting, setGreeting] = useState("Good morning");

  useEffect(() => {
    setGreeting(timeOfDay());
  }, []);

  return (
    <h1 className="text-3xl font-bold uppercase leading-tight text-solar-sage sm:text-4xl">
      {greeting}
    </h1>
  );
}
