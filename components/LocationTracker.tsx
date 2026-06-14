"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getFreshCoordsIfNeeded,
  loadCachedCoords,
  distanceKm,
  SIGNIFICANT_MOVE_KM,
  LocationPermissionDeniedError,
  checkLocationPermission,
  openAppSettings,
} from "@/lib/gps";
import { regenerateMission } from "@/lib/api-client";
import type { TopicId } from "@/lib/missionMatrix";

type Props = {
  topic: TopicId;
  level: number;
  generationHasCoords: boolean;
  generationLat: number | null;
  generationLng: number | null;
  onReloadMissions?: () => void;
};

export function LocationTracker({
  topic,
  level,
  generationHasCoords,
  generationLat,
  generationLng,
  onReloadMissions,
}: Props) {
  const router = useRouter();
  const [showBanner, setShowBanner] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Incremented when the user returns from Settings so the track effect re-runs.
  const [resumeKey, setResumeKey] = useState(0);

  // Stable ref so the App resume listener sees the latest callback without
  // being part of its own dep array.
  const onReloadMissionsRef = useRef(onReloadMissions);
  onReloadMissionsRef.current = onReloadMissions;

  useEffect(() => {
    let cancelled = false;

    async function track() {
      console.log("[LocationTracker] Starting location check…");

      // Check existing permission status on native before doing any GPS work.
      // If already denied, show the banner immediately without requesting again.
      const permStatus = await checkLocationPermission();
      if (permStatus === "denied") {
        console.warn("[LocationTracker] Location permission already denied.");
        if (!cancelled) setPermissionDenied(true);
        return;
      }

      const cached = loadCachedCoords();
      console.log(
        "[LocationTracker] Cached coords:",
        cached
          ? `${cached.lat.toFixed(5)}, ${cached.lng.toFixed(5)} (${Math.round((Date.now() - cached.ts) / 60_000)} min ago)`
          : "none",
      );

      let result: Awaited<ReturnType<typeof getFreshCoordsIfNeeded>>;
      try {
        result = await getFreshCoordsIfNeeded();
      } catch (err) {
        if (err instanceof LocationPermissionDeniedError) {
          console.warn("[LocationTracker] Location permission denied by user.");
          if (!cancelled) setPermissionDenied(true);
        }
        return;
      }

      if (!result) {
        console.warn(
          "[LocationTracker] Could not obtain GPS coordinates (unavailable).",
        );
        return;
      }

      if (cancelled) return;

      const { coords } = result;
      console.log(
        `[LocationTracker] Current coords: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
      );

      if (!generationHasCoords) {
        console.log(
          "[LocationTracker] No coords on current generation → auto-regenerating…",
        );
        try {
          await regenerateMission(topic, level, coords);
          if (!cancelled) {
            if (onReloadMissionsRef.current) onReloadMissionsRef.current();
            else router.refresh();
          }
        } catch (err) {
          console.error("[LocationTracker] Auto-regeneration failed:", err);
        }
        return;
      }

      if (generationLat != null && generationLng != null) {
        const moved = distanceKm(
          { lat: generationLat, lng: generationLng },
          coords,
        );
        console.log(
          `[LocationTracker] Distance from generation point: ${moved.toFixed(2)} km (threshold: ${SIGNIFICANT_MOVE_KM} km)`,
        );
        if (moved > SIGNIFICANT_MOVE_KM && !cancelled) {
          setPendingCoords(coords);
          setShowBanner(true);
        }
      }
    }

    void track();
    return () => {
      cancelled = true;
    };
    // resumeKey triggers a re-check after returning from the Settings screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeKey]);

  // When permission is denied, listen for the app coming back to the foreground.
  // If the user enabled location in Settings, the next check will succeed and
  // the denied banner disappears.
  useEffect(() => {
    if (!permissionDenied) return;

    let handle: { remove: () => void } | null = null;

    async function attachListener() {
      try {
        const { App } = await import("@capacitor/app");
        handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            setPermissionDenied(false);
            setResumeKey((k) => k + 1);
          }
        });
      } catch {
        // Not on native — no-op
      }
    }

    void attachListener();
    return () => {
      handle?.remove();
    };
  }, [permissionDenied]);

  async function onRefresh() {
    if (!pendingCoords || refreshing) return;
    setRefreshing(true);
    try {
      await regenerateMission(topic, level, pendingCoords);
      if (onReloadMissionsRef.current) onReloadMissionsRef.current();
      else router.refresh();
    } catch {
      setRefreshing(false);
      setShowBanner(false);
    }
  }

  if (permissionDenied) {
    const isAndroid =
      typeof window !== "undefined" &&
      window.Capacitor?.getPlatform?.() === "android";

    return (
      <div className="flex flex-col gap-3 rounded-xl bg-solar-field px-4 py-4 text-sm ring-1 ring-solar-leafmd">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-lg" aria-hidden="true">📍</span>
          <p className="text-solar-sage/80">
            <strong className="text-solar-sage">Permite el acceso a la ubicación</strong>{" "}
            para recibir recomendaciones de misiones cerca de ti.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void openAppSettings()}
          className="self-start rounded-lg bg-solar-green px-4 py-2 text-xs font-bold uppercase tracking-wide text-solar-cream transition hover:bg-solar-moss"
        >
          Abrir Configuración
        </button>
        {isAndroid && (
          <p className="text-xs text-solar-sage/50">
            Configuración → Aplicaciones → Green Quest → Permisos → Ubicación
          </p>
        )}
      </div>
    );
  }

  if (!showBanner) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm ring-1 ring-amber-200">
      <div className="flex items-center gap-2">
        <span aria-hidden="true">📍</span>
        <span className="text-amber-800">
          You seem to be in a different place than when these missions were
          generated.
        </span>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
        >
          {refreshing ? "Updating…" : "Get local missions"}
        </button>
        <button
          type="button"
          onClick={() => setShowBanner(false)}
          className="rounded-lg px-2 py-1.5 text-xs text-amber-700 hover:bg-amber-100"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
