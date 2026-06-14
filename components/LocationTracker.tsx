"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getFreshCoordsIfNeeded,
  loadCachedCoords,
  distanceKm,
  SIGNIFICANT_MOVE_KM,
} from "@/lib/gps";
import { regenerateMission } from "@/lib/api-client";
import type { TopicId } from "@/lib/missionMatrix";

type Props = {
  topic: TopicId;
  level: number;
  // Whether the current AiGeneration was already tied to GPS coordinates.
  // If false, we auto-regenerate silently so the first set of missions is
  // location-aware. If true, we only prompt the user when they've moved.
  generationHasCoords: boolean;
  // Coords that were used for the current generation (if any). Used to
  // detect whether the user has moved significantly since then.
  generationLat: number | null;
  generationLng: number | null;
};

/**
 * Invisible client component that runs on every topic page load.
 *
 * Strategy:
 *  1. Get fresh GPS coords (from cache if < 4 h old, otherwise re-ask browser).
 *  2. If the current generation has no coords → silently regenerate so missions
 *     are location-aware from the very first load.
 *  3. If the current generation has coords but the user moved > 2 km → show a
 *     non-intrusive banner so the user can decide to refresh missions.
 *  4. Otherwise → do nothing.
 */
export function LocationTracker({
  topic,
  level,
  generationHasCoords,
  generationLat,
  generationLng,
}: Props) {
  const router = useRouter();
  const [showBanner, setShowBanner] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function track() {
      console.log("[LocationTracker] Starting location check…");

      const cached = loadCachedCoords();
      console.log("[LocationTracker] Cached coords:", cached
        ? `${cached.lat.toFixed(5)}, ${cached.lng.toFixed(5)} (${Math.round((Date.now() - cached.ts) / 60_000)} min ago)`
        : "none"
      );

      const result = await getFreshCoordsIfNeeded();
      if (cancelled) return;

      if (!result) {
        console.warn("[LocationTracker] Could not obtain GPS coordinates (denied or unavailable).");
        return;
      }

      const { coords } = result;
      console.log(`[LocationTracker] Current coords: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
      console.log(`[LocationTracker] Generation has coords: ${generationHasCoords}`, generationHasCoords
        ? `(${generationLat?.toFixed(5)}, ${generationLng?.toFixed(5)})`
        : ""
      );

      if (!generationHasCoords) {
        console.log("[LocationTracker] No coords on current generation → auto-regenerating with location…");
        try {
          await regenerateMission(topic, level, coords);
          console.log("[LocationTracker] Regeneration complete — refreshing page.");
          if (!cancelled) router.refresh();
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
        console.log(`[LocationTracker] Distance from generation point: ${moved.toFixed(2)} km (threshold: ${SIGNIFICANT_MOVE_KM} km)`);
        if (moved > SIGNIFICANT_MOVE_KM) {
          console.log("[LocationTracker] Significant move detected → showing location-change banner.");
          if (!cancelled) {
            setPendingCoords(coords);
            setShowBanner(true);
          }
        } else {
          console.log("[LocationTracker] Same area — no action needed.");
        }
      }
    }

    void track();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onRefresh() {
    if (!pendingCoords || refreshing) return;
    setRefreshing(true);
    try {
      await regenerateMission(topic, level, pendingCoords);
      router.refresh();
    } catch {
      setRefreshing(false);
      setShowBanner(false);
    }
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
