/**
 * api-client — every fetch the frontend makes goes through this file.
 *
 * Step 10 layered offline support on top:
 *   - Reads (getProgress, getMissions) are network-first, Dexie-fallback.
 *     Successful responses are mirrored to IndexedDB so the next offline
 *     load has fresh data.
 *   - Writes (chooseMission, completeMission, updatePreferences) detect
 *     offline state, queue the payload into Dexie's pendingActions, and
 *     return an optimistic synthetic response. The OfflineSync component
 *     flushes the queue against the real endpoints on the next `online`
 *     event (oldest first).
 *   - Regenerate requires Claude, so when offline it throws a friendly
 *     ApiError instead of queueing.
 *
 * All Dexie calls are guarded so the module stays importable from server
 * components (it's only ever invoked from client components today).
 */

export type SessionUser = {
  id: string;
  email: string;
  city: string | null;
  interests: string[];
  preferredDuration: "short" | "medium" | "long" | null;
};

export type SessionResponse = { user: SessionUser | null };

async function request<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = (await res.json()) as { error?: string };
      detail = body.error;
    } catch {
      // body wasn't JSON; fall through
    }
    throw new ApiError(
      detail ?? `Request failed (${res.status})`,
      res.status,
    );
  }

  // 204 / empty bodies
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Offline plumbing (Step 10)
// ---------------------------------------------------------------------------

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function isOffline(): boolean {
  return isBrowser() && navigator.onLine === false;
}

function isNetworkError(err: unknown): boolean {
  // fetch() throws TypeError on network failure (CORS, DNS, offline, etc).
  return err instanceof TypeError;
}

// ---------------------------------------------------------------------------
// Auth / session
// ---------------------------------------------------------------------------

export async function getSession(): Promise<SessionResponse> {
  try {
    return await request<SessionResponse>("/api/session");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return { user: null };
    }
    throw err;
  }
}

export async function registerUser(payload: {
  email: string;
  password: string;
}): Promise<{ user: { id: string; email: string } }> {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

import type { TopicId } from "@/lib/missionMatrix";
import { db, missionKey, type PendingAction } from "@/lib/db-client";

export type ProgressRow = {
  topic: TopicId;
  currentLevel: number;
  completedLevels: number[];
};

export async function getProgress(): Promise<ProgressRow[]> {
  if (!isOffline()) {
    try {
      const rows = await request<ProgressRow[]>("/api/progress");
      if (isBrowser()) {
        await db().progress.bulkPut(
          rows.map((r) => ({
            topic: r.topic,
            currentLevel: r.currentLevel,
            completedLevels: r.completedLevels,
            updatedAt: Date.now(),
          })),
        );
      }
      return rows;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      // network failed mid-flight; fall through to cache
    }
  }

  if (!isBrowser()) {
    throw new ApiError("Offline and no cache available", 503);
  }
  const cached = await db().progress.toArray();
  return cached.map((c) => ({
    topic: c.topic as TopicId,
    currentLevel: c.currentLevel,
    completedLevels: c.completedLevels,
  }));
}

export async function createProgress(topic: TopicId): Promise<ProgressRow> {
  return request<ProgressRow>("/api/progress", {
    method: "POST",
    body: JSON.stringify({ topic }),
  });
}

// ---------------------------------------------------------------------------
// Geolocation suggestion (used by sign-up + preferences UI)
// ---------------------------------------------------------------------------

export async function getCitySuggestion(): Promise<{ city: string | null }> {
  return request<{ city: string | null }>("/api/geolocation");
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

export type MissionOption = {
  title: string;
  brief: string;
  tip: string;
  duration: "short" | "medium" | "long";
};

export type MissionsResponse = {
  aiGenerationId: string;
  options: MissionOption[];
};

export async function getMissions(
  topic: TopicId,
  level: number,
): Promise<MissionsResponse> {
  const qs = new URLSearchParams({ topic, level: String(level) });
  if (!isOffline()) {
    try {
      const res = await request<MissionsResponse>(
        `/api/mission?${qs.toString()}`,
      );
      if (isBrowser()) {
        await db().currentMission.put({
          key: missionKey(topic, level),
          topic,
          level,
          aiGenerationId: res.aiGenerationId,
          // Persist enough of each option that the offline UI can render
          // it; matches MissionOption shape but stored under stable names.
          options: res.options.map((o) => ({
            title: o.title,
            description: o.brief,
            estimatedDuration: o.duration,
            difficultyHint: o.tip,
          })),
          updatedAt: Date.now(),
        });
      }
      return res;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  }

  if (!isBrowser()) {
    throw new ApiError("Offline and no cache available", 503);
  }
  const cached = await db().currentMission.get(missionKey(topic, level));
  if (!cached) {
    throw new ApiError(
      "Offline. These missions haven't been loaded before — connect once to fetch them.",
      503,
    );
  }
  return {
    aiGenerationId: cached.aiGenerationId,
    options: cached.options.map((o) => ({
      title: o.title,
      brief: o.description,
      tip: o.difficultyHint,
      duration:
        o.estimatedDuration === "short" ||
        o.estimatedDuration === "medium" ||
        o.estimatedDuration === "long"
          ? (o.estimatedDuration as MissionOption["duration"])
          : "medium",
    })),
  };
}

export type ChooseMissionPayload = {
  topic: TopicId;
  level: number;
  aiGenerationId: string;
  chosenIndex: number;
};

export type ChooseMissionResponse = {
  missionChoiceId: string;
  status: "active" | "abandoned" | "completed";
};

export async function chooseMission(
  payload: ChooseMissionPayload,
): Promise<ChooseMissionResponse> {
  if (isOffline() && isBrowser()) {
    await db().pendingActions.add({
      type: "choose",
      ...payload,
      createdAt: Date.now(),
    } satisfies PendingAction);
    await db()
      .currentMission.update(missionKey(payload.topic, payload.level), {
        optimisticChosenIndex: payload.chosenIndex,
      })
      .catch(() => {
        /* row may not exist yet; choose was queued anyway */
      });
    return { missionChoiceId: "local-pending", status: "active" };
  }
  return request<ChooseMissionResponse>("/api/mission/choose", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type CompleteMissionPayload = {
  topic: TopicId;
  level: number;
  aiGenerationId: string;
  chosenIndex: number;
  note?: string;
  /**
   * The picked image File. Online: we upload it directly to Supabase
   * Storage via a signed URL, then submit the resulting path. Offline:
   * we stash the Blob on the pending action and OfflineSync handles the
   * upload-then-submit dance on reconnect.
   */
  photoFile?: File | null;
};

export type CompleteMissionResponse = {
  progress: ProgressRow;
};

export async function completeMission(
  payload: CompleteMissionPayload,
): Promise<CompleteMissionResponse> {
  if (isOffline() && isBrowser()) {
    await db().pendingActions.add({
      type: "complete",
      topic: payload.topic,
      level: payload.level,
      aiGenerationId: payload.aiGenerationId,
      chosenMissionIndex: payload.chosenIndex,
      note: payload.note ?? null,
      // Dexie can store Blob values directly — no base64 round-trip
      // required. OfflineSync uploads this blob to Supabase Storage on
      // reconnect and then submits the resulting path.
      photoBlob: payload.photoFile ?? null,
      createdAt: Date.now(),
    } satisfies PendingAction);

    // Optimistically bump local progress so the UI advances. We never
    // exceed MAX_LEVEL (6) and we add the current level to completedLevels
    // only if it isn't already there.
    const cached = (await db().progress.get(payload.topic)) ?? {
      topic: payload.topic,
      currentLevel: payload.level,
      completedLevels: [],
      updatedAt: 0,
    };
    const nextLevel = Math.min(6, payload.level + 1);
    const completed = cached.completedLevels.includes(payload.level)
      ? cached.completedLevels
      : [...cached.completedLevels, payload.level];
    const optimistic = {
      topic: payload.topic,
      currentLevel: nextLevel,
      completedLevels: completed,
      updatedAt: Date.now(),
    };
    await db().progress.put(optimistic);

    return {
      progress: {
        topic: payload.topic,
        currentLevel: nextLevel,
        completedLevels: completed,
      },
    };
  }

  // Online path: upload the photo (if any) directly to Supabase Storage
  // first, then submit the completion referencing the resulting path.
  let photoPath: string | undefined;
  if (payload.photoFile) {
    photoPath = await uploadPhoto(payload.photoFile);
  }

  return request<CompleteMissionResponse>("/api/mission/complete", {
    method: "POST",
    body: JSON.stringify({
      topic: payload.topic,
      level: payload.level,
      aiGenerationId: payload.aiGenerationId,
      chosenIndex: payload.chosenIndex,
      note: payload.note,
      photoPath,
    }),
  });
}

export async function regenerateMission(
  topic: TopicId,
  level: number,
): Promise<MissionsResponse> {
  if (isOffline()) {
    // Regenerate needs Claude; queueing it would be misleading because we
    // can't synthesise three plausible new missions client-side.
    throw new ApiError(
      "Regenerating missions needs an internet connection.",
      503,
    );
  }
  return request<MissionsResponse>("/api/mission/regenerate", {
    method: "POST",
    body: JSON.stringify({ topic, level }),
  });
}

export async function resetTopic(
  topic: TopicId,
): Promise<{ progress: ProgressRow }> {
  return request<{ progress: ProgressRow }>("/api/topic/reset", {
    method: "POST",
    body: JSON.stringify({ topic }),
  });
}

export type UpdatePreferencesPayload = {
  city?: string;
  interests?: string[];
  preferredDuration?: "short" | "medium" | "long" | null;
};

export async function updatePreferences(
  payload: UpdatePreferencesPayload,
): Promise<{ user: SessionUser }> {
  if (isOffline() && isBrowser()) {
    await db().pendingActions.add({
      type: "preferences",
      interests: payload.interests,
      preferredDuration: payload.preferredDuration,
      createdAt: Date.now(),
    } satisfies PendingAction);
    // We don't keep a User cache, so the optimistic response is best-effort:
    // return a synthetic shape with the new values plus placeholders.
    return {
      user: {
        id: "offline",
        email: "",
        city: null,
        interests: payload.interests ?? [],
        preferredDuration: payload.preferredDuration ?? null,
      },
    };
  }
  return request<{ user: SessionUser }>("/api/user/preferences", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// History (Step 11)
// ---------------------------------------------------------------------------

export type HistoryItem = {
  id: string;
  topic: TopicId;
  level: number;
  title: string | null;
  brief: string | null;
  duration: "short" | "medium" | "long" | null;
  note: string | null;
  photoUrl: string | null;
  completedAt: string;
};

export type HistoryResponse = {
  items: HistoryItem[];
  totalsByTopic: Record<string, number>;
};

export async function getHistory(): Promise<HistoryResponse> {
  return request<HistoryResponse>("/api/history");
}

/**
 * Upload a photo Blob/File directly to Supabase Storage and return the
 * bucket-relative path. Two-step:
 *
 *   1. POST /api/photo/upload-url — server mints a single-use signed URL
 *      scoped to `{userId}/{uuid}.jpg` under the mission-photos bucket.
 *   2. Browser PUTs the bytes straight to Supabase via the signed URL.
 *      Our Next.js function never sees the photo, which sidesteps the
 *      4.5 MB serverless body limit entirely.
 *
 * The returned path is what gets persisted in `Completion.photoPath`. We
 * mint a signed read URL for display at history-render time.
 */
export async function uploadPhoto(file: Blob): Promise<string> {
  const { path, token } = await request<{ path: string; token: string }>(
    "/api/photo/upload-url",
    { method: "POST" },
  );

  // Lazy-import so server-only code paths don't pull in the supabase-js
  // client bundle until something actually needs it.
  const { getBrowserSupabase, PHOTO_BUCKET } = await import("@/lib/supabase");
  const supabase = getBrowserSupabase();

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .uploadToSignedUrl(path, token, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (error) {
    throw new ApiError(error.message, 502);
  }
  return path;
}
