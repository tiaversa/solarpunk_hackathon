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
      createdAt: number;
    }
  | {
      id?: number;
      type: "preferences";
      interests?: string[];
      preferredDuration?: "short" | "medium" | "long" | null;
      createdAt: number;
    };

class SolarpunkDB extends Dexie {
  progress!: Table<CachedProgress, string>;
  currentMission!: Table<CachedMission, string>;
  pendingActions!: Table<PendingAction, number>;

  constructor() {
    super("solarpunk-missions-v1");
    this.version(1).stores({
      progress: "topic",
      // composite-string key (key) + secondary index on topic so we can
      // .where("topic")=... when the user resets a topic.
      currentMission: "key, topic",
      // Auto-incrementing id keeps insertion order; secondary index on
      // createdAt is paranoia in case id wraps or rows are imported.
      pendingActions: "++id, createdAt",
    });
  }
}

let _db: SolarpunkDB | null = null;
export function db(): SolarpunkDB {
  if (typeof window === "undefined") {
    throw new Error("db() may only be called in the browser");
  }
  if (!_db) _db = new SolarpunkDB();
  return _db;
}

export function missionKey(topic: string, level: number): string {
  return `${topic}|${level}`;
}
