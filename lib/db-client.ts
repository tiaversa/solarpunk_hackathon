"use client";

import Dexie, { type Table } from "dexie";

// ---------------------------------------------------------------------------
// IndexedDB schema (Dexie 4). Keep it small and explicit — every field
// the offline-aware api-client needs to render a page or queue a write
// lives here. Three stores:
//
//   progress       — last known per-topic Progress row (mirrors server)
//   currentMission — last known mission set for (topic, level) tuples
//   pendingActions — durable FIFO queue of writes done while offline
// ---------------------------------------------------------------------------

export type CachedProgress = {
  topic: string;
  currentLevel: number;
  completedLevels: number[];
  /** ms since epoch — used to decide if we should bypass on next online. */
  updatedAt: number;
};

export type CachedMissionOption = {
  title: string;
  description: string;
  estimatedDuration: string;
  difficultyHint: string;
};

export type CachedMission = {
  /** Composite primary key: `${topic}|${level}`. */
  key: string;
  topic: string;
  level: number;
  aiGenerationId: string;
  options: CachedMissionOption[];
  /** Optional optimistic choice the user picked while offline. */
  optimisticChosenIndex?: number;
  updatedAt: number;
};

export type PendingAction =
  | {
      id?: number;
      type: "choose";
      topic: string;
      level: number;
      aiGenerationId: string;
      chosenIndex: number;
      createdAt: number;
    }
  | {
      id?: number;
      type: "complete";
      topic: string;
      level: number;
      aiGenerationId: string;
      chosenMissionIndex: number;
      note: string | null;
      /**
       * The picked image kept as a Blob until we're back online. Dexie
       * stores Blob values natively (IndexedDB is structured-clone), so
       * we avoid the ~33% size overhead of base64. On reconnect,
       * OfflineSync uploads this to Supabase Storage and then submits
       * the resulting path to /api/mission/complete.
       */
      photoBlob: Blob | null;
      /**
       * Set by OfflineSync after a successful upload to Supabase Storage
       * but BEFORE we attempt /api/mission/complete. If the complete
       * request then fails and we retry, we reuse this path instead of
       * re-uploading the Blob — otherwise every transient submit failure
       * would orphan another file in Storage.
       */
      uploadedPhotoPath?: string | null;
      createdAt: number;
    }
  | {
      id?: number;
      type: "preferences";
      interests?: string[];
      preferredDuration?: "short" | "medium" | "long" | null;
      createdAt: number;
    };

/**
 * Decode a `data:image/...;base64,...` URL into a Blob. Used by the v1→v2
 * Dexie upgrade to convert legacy queued completions where the photo was
 * stored as a base64 string. Returns null on any malformed input so we
 * never blow up the upgrade transaction over a single bad row.
 */
function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const commaIdx = dataUrl.indexOf(",");
    if (commaIdx < 0) return null;
    const meta = dataUrl.slice(0, commaIdx);
    const b64 = dataUrl.slice(commaIdx + 1);
    if (!b64) return null;
    const mime = /data:([^;]+);base64/.exec(meta)?.[1] ?? "image/jpeg";
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  } catch {
    return null;
  }
}

class GreenQuestDB extends Dexie {
  progress!: Table<CachedProgress, string>;
  currentMission!: Table<CachedMission, string>;
  pendingActions!: Table<PendingAction, number>;

  constructor() {
    // NOTE: the Dexie database name is the IndexedDB identifier. Renaming
    // from "solarpunk-missions-v1" to "green-quest-v1" means existing
    // browsers will start with a fresh, empty offline cache — the old
    // database lingers in IndexedDB until manually cleared but is never
    // accessed again. Acceptable for this rebrand; if real users were
    // already running offline-cached state we'd want a one-time migration
    // (open old DB, copy rows over, then delete) instead.
    super("green-quest-v1");
    this.version(1).stores({
      progress: "topic",
      // composite-string key (key) + secondary index on topic so we can
      // .where("topic")=... when the user resets a topic.
      currentMission: "key, topic",
      // Auto-incrementing id keeps insertion order; secondary index on
      // createdAt is paranoia in case id wraps or rows are imported.
      pendingActions: "++id, createdAt",
    });

    // v2: convert any queued "complete" actions from the pre-Supabase
    // shape (`photoBase64: string | null`) to the new shape
    // (`photoBlob: Blob | null`). Stores schema is unchanged — only the
    // value shape in pendingActions rows shifts. Without this upgrade,
    // a user who picked a photo offline before deploying the Supabase
    // change would replay their completion text-only on reconnect.
    this.version(2).upgrade(async (tx) => {
      type LegacyCompleteRow = {
        type: string;
        photoBase64?: string | null;
        photoBlob?: Blob | null;
      };
      await tx
        .table<LegacyCompleteRow>("pendingActions")
        .toCollection()
        .modify((row) => {
          if (row.type !== "complete") return;
          if (typeof row.photoBase64 === "string" && row.photoBase64) {
            row.photoBlob = dataUrlToBlob(row.photoBase64);
          } else if (row.photoBlob === undefined) {
            row.photoBlob = null;
          }
          delete row.photoBase64;
        });
    });
  }
}

let _db: GreenQuestDB | null = null;
export function db(): GreenQuestDB {
  if (typeof window === "undefined") {
    throw new Error("db() may only be called in the browser");
  }
  if (!_db) _db = new GreenQuestDB();
  return _db;
}

export function missionKey(topic: string, level: number): string {
  return `${topic}|${level}`;
}
