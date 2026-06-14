"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";

type Props = {
  /** Display name shown on the trigger (e.g. email local-part). */
  username?: string;
};

const ITEMS = [
  { href: "/history", label: "History" },
  { href: "/preferences", label: "Preferences" },
];

type Theme = "dark" | "light";

const LIGHT_THEME_COLOR = "#EDF2E1";
const DARK_THEME_COLOR = "#1A1F14";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("light", theme === "light");
  try {
    window.localStorage.setItem("solar.theme", theme);
  } catch {
    // Storage may be unavailable (private mode); the choice just won't persist.
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", theme === "light" ? LIGHT_THEME_COLOR : DARK_THEME_COLOR);
}

export function UserMenu({ username }: Props) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("light") ? "light" : "dark");
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-solar-leafmd bg-solar-panel/60 px-3 py-1.5 text-xs text-solar-sage transition hover:border-solar-green"
      >
        {username && <span className="max-w-[10rem] truncate">{username}</span>}
        <span
          aria-hidden="true"
          className={`text-[10px] transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 w-44 overflow-hidden rounded-2xl border border-solar-leafmd bg-solar-panel shadow-xl shadow-black/40"
        >
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm text-solar-sage transition hover:bg-solar-field/70 hover:text-solar-cream"
            >
              {item.label}
            </Link>
          ))}
          <div className="h-px bg-solar-leafmd" />
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={theme === "light"}
            onClick={toggleTheme}
            className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm text-solar-sage transition hover:bg-solar-field/70 hover:text-solar-cream"
          >
            <span className="flex items-center gap-2">
              <span aria-hidden="true">{theme === "light" ? "☀️" : "🌙"}</span>
              {theme === "light" ? "Light mode" : "Dark mode"}
            </span>
            <span
              aria-hidden="true"
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
                theme === "light" ? "bg-solar-green" : "bg-solar-leafmd"
              }`}
            >
              <span
                className={`absolute h-4 w-4 rounded-full bg-solar-cream transition-transform ${
                  theme === "light" ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>
          <div className="h-px bg-solar-leafmd" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut({ callbackUrl: "/" });
            }}
            className="block w-full px-4 py-2.5 text-left text-sm text-solar-line transition hover:bg-solar-field/70 hover:text-solar-green"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
