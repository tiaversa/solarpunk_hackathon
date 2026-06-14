"use client";

export type Coords = { lat: number; lng: number };

declare global {
  interface Window {
    Capacitor?: { isNativePlatform: () => boolean };
  }
}

// ── Local cache (localStorage) ─────────────────────────────────────────────

const LS_KEY = "sp_last_coords";

type CachedCoords = Coords & { ts: number };

export function loadCachedCoords(): CachedCoords | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedCoords;
  } catch {
    return null;
  }
}

export function saveCachedCoords(coords: Coords): void {
  if (typeof window === "undefined") return;
  try {
    const entry: CachedCoords = { ...coords, ts: Date.now() };
    localStorage.setItem(LS_KEY, JSON.stringify(entry));
  } catch {
    // storage quota exceeded or private mode — ignore
  }
}

// Haversine distance in km between two points.
export function distanceKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ── GPS acquisition ────────────────────────────────────────────────────────

/**
 * Return the user's current GPS coordinates, or null if unavailable/denied.
 *
 * Runtime selection:
 *  - Ionic/Capacitor native: uses @capacitor/geolocation for native OS-level
 *    permission UX and higher indoor accuracy. Activate by installing the
 *    package and uncommenting the block below.
 *  - Web / Ionic WebView: falls back to navigator.geolocation.
 */
export async function getCoords(): Promise<Coords | null> {
  if (typeof window === "undefined") return null;

  // ── Capacitor (Ionic native) path ──────────────────────────────────────────
  // npm install @capacitor/geolocation && npx cap sync, then uncomment:
  //
  // if (window.Capacitor?.isNativePlatform()) {
  //   try {
  //     const { Geolocation } = await import("@capacitor/geolocation");
  //     const pos = await Geolocation.getCurrentPosition({
  //       enableHighAccuracy: true,
  //       timeout: 10_000,
  //     });
  //     return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  //   } catch { /* fall through */ }
  // }

  if (!("geolocation" in navigator)) return null;
  return new Promise<Coords | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 12_000, maximumAge: 60_000, enableHighAccuracy: false },
    );
  });
}

/**
 * Get fresh coordinates only when needed:
 *  - No cached coords exist
 *  - Cached coords are older than `maxAgeMs` (default 4 hours)
 *
 * Always saves to localStorage on success.
 */
export async function getFreshCoordsIfNeeded(
  maxAgeMs = 4 * 60 * 60 * 1000,
): Promise<{ coords: Coords; changed: boolean } | null> {
  const cached = loadCachedCoords();
  const now = Date.now();

  if (cached && now - cached.ts < maxAgeMs) {
    // Cache is still fresh — return without hitting the GPS API.
    return { coords: { lat: cached.lat, lng: cached.lng }, changed: false };
  }

  const fresh = await getCoords();
  if (!fresh) return null;

  const moved =
    cached != null && distanceKm(cached, fresh) > SIGNIFICANT_MOVE_KM;
  saveCachedCoords(fresh);
  return { coords: fresh, changed: cached == null || moved };
}

// A move below this threshold (GPS drift, small walks) doesn't count as a
// meaningful location change that warrants new missions.
export const SIGNIFICANT_MOVE_KM = 2;

// How long a cache hit prevents re-querying the GPS hardware (4 hours).
export const COORDS_MAX_AGE_MS = 4 * 60 * 60 * 1000;
