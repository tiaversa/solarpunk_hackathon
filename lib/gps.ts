"use client";

export type Coords = { lat: number; lng: number };

declare global {
  interface Window {
    Capacitor?: { isNativePlatform: () => boolean; getPlatform?: () => string };
  }
}

export class LocationPermissionDeniedError extends Error {
  constructor() {
    super("Location permission denied");
    this.name = "LocationPermissionDeniedError";
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

// ── Permission helpers ─────────────────────────────────────────────────────

/**
 * Check current location permission status without showing any dialog.
 * Returns 'denied' if blocked, 'granted' if allowed, 'prompt' if not asked yet
 * or running on web (where the browser handles permissions implicitly).
 */
export async function checkLocationPermission(): Promise<"granted" | "denied" | "prompt"> {
  if (typeof window === "undefined") return "prompt";
  if (!window.Capacitor?.isNativePlatform()) return "prompt";
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    const status = await Geolocation.checkPermissions();
    if (status.location === "granted") return "granted";
    if (status.location === "denied") return "denied";
    return "prompt"; // covers 'prompt' and 'prompt-with-rationale'
  } catch {
    return "prompt";
  }
}

/**
 * Open the app's system settings page so the user can manage permissions.
 * iOS: app-settings: URL scheme handled natively by Capacitor.
 * Android: intent URI that Capacitor's WebView delegates to the OS, opening
 *   the app's detail/permissions screen in system Settings.
 */
export async function openAppSettings(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!window.Capacitor?.isNativePlatform()) return;
  const platform = window.Capacitor.getPlatform?.();

  if (platform === "ios") {
    window.location.href = "app-settings:";
    return;
  }

  if (platform === "android") {
    try {
      const { registerPlugin } = await import("@capacitor/core");
      const NativeSettings = registerPlugin<{ openAppSettings(): Promise<void> }>("NativeSettings");
      await NativeSettings.openAppSettings();
    } catch (e) {
      console.error("[openAppSettings] native call failed:", e);
    }
  }
}

// ── GPS acquisition ────────────────────────────────────────────────────────

/**
 * Return the user's current GPS coordinates, or null if unavailable.
 * Throws LocationPermissionDeniedError when the user explicitly denies access.
 *
 * On native Capacitor (Android/iOS) uses @capacitor/geolocation for proper
 * OS-level permission dialogs. Falls back to navigator.geolocation on web.
 */
export async function getCoords(): Promise<Coords | null> {
  if (typeof window === "undefined") return null;

  // ── Capacitor native path ──────────────────────────────────────────────────
  if (window.Capacitor?.isNativePlatform()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10_000,
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch (err: unknown) {
      const code = (err as { code?: number }).code;
      const msg = ((err as { message?: string }).message ?? "").toLowerCase();
      if (code === 1 || msg.includes("denied") || msg.includes("notallowed")) {
        throw new LocationPermissionDeniedError();
      }
      // Position unavailable or timeout — fall through to web path
    }
  }

  // ── Web / Capacitor WebView fallback ───────────────────────────────────────
  if (!("geolocation" in navigator)) return null;
  return new Promise<Coords | null>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === 1) reject(new LocationPermissionDeniedError());
        else resolve(null);
      },
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
 * Propagates LocationPermissionDeniedError to callers.
 */
export async function getFreshCoordsIfNeeded(
  maxAgeMs = 4 * 60 * 60 * 1000,
): Promise<{ coords: Coords; changed: boolean } | null> {
  const cached = loadCachedCoords();
  const now = Date.now();

  if (cached && now - cached.ts < maxAgeMs) {
    return { coords: { lat: cached.lat, lng: cached.lng }, changed: false };
  }

  const fresh = await getCoords(); // throws LocationPermissionDeniedError if denied
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
