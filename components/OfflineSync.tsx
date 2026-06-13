"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { uploadPhoto } from "@/lib/api-client";
import { db, type PendingAction } from "@/lib/db-client";

/**
 * Mounted once in the root layout. Listens for the browser's `online`
 * event and flushes Dexie's pendingActions queue against the real API
 * endpoints in insertion order. Stops on the first failure so we don't
 * silently drop later actions that may depend on earlier state.
 *
 * After a successful flush, calls router.refresh() so server components
 * pick up the now-canonical state (Progress, MissionChoice, etc).
 */
export function OfflineSync() {
  const router = useRouter();

  useEffect(() => {
    let running = false;

    async function flushOne(action: PendingAction): Promise<void> {
      switch (action.type) {
        case "choose":
          await fetch("/api/mission/choose", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              topic: action.topic,
              level: action.level,
              aiGenerationId: action.aiGenerationId,
              chosenIndex: action.chosenIndex,
            }),
          }).then(throwIfNotOk);
          return;
        case "complete": {
          // If the user picked a photo while offline, upload it to
          // Supabase Storage first (we deferred this step because there
          // was no network at submit time), then submit the completion
          // referencing the resulting path.
          let photoPath: string | undefined;
          if (action.photoBlob) {
            photoPath = await uploadPhoto(action.photoBlob);
          }
          await fetch("/api/mission/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              topic: action.topic,
              level: action.level,
              aiGenerationId: action.aiGenerationId,
              chosenIndex: action.chosenMissionIndex,
              note: action.note ?? undefined,
              photoPath,
            }),
          }).then(throwIfNotOk);
          return;
        }
        case "preferences":
          await fetch("/api/user/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              interests: action.interests,
              preferredDuration: action.preferredDuration,
            }),
          }).then(throwIfNotOk);
          return;
      }
    }

    async function sync() {
      if (running) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return;
      }
      running = true;
      try {
        const pending = await db().pendingActions
          .orderBy("id")
          .toArray();
        if (pending.length === 0) return;
        let flushed = 0;
        for (const action of pending) {
          try {
            await flushOne(action);
            if (action.id !== undefined) {
              await db().pendingActions.delete(action.id);
            }
            flushed++;
          } catch (err) {
            console.warn(
              `[offline-sync] failed flushing ${action.type}, stopping. ` +
                `${flushed} of ${pending.length} actions synced.`,
              err,
            );
            break;
          }
        }
        if (flushed > 0) {
          // The server state may have advanced (new Progress, completions).
          // router.refresh() re-renders server components with fresh data.
          router.refresh();
        }
      } finally {
        running = false;
      }
    }

    window.addEventListener("online", sync);
    // Run once on mount in case we came back online before the page loaded.
    void sync();

    return () => window.removeEventListener("online", sync);
  }, [router]);

  return null;
}

async function throwIfNotOk(res: Response): Promise<void> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      /* non-JSON */
    }
    throw new Error(detail);
  }
}
