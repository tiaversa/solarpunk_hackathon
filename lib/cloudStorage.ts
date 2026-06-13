/**
 * Cold-storage helper for large AI audit blobs (Step 11b).
 *
 * Cloudinary supports a `raw` resource_type that accepts arbitrary
 * binary/text payloads. We upload `AiGeneration.promptSent` and
 * `AiGeneration.rawResponse` here as JSON, then store only the secure
 * URL in the DB row. This keeps individual Postgres rows tiny — at scale
 * (~20KB+ per LLM transcript) that's a 100x+ row size reduction.
 *
 * Behaviour when CLOUDINARY_URL is unset:
 *   - `isCloudStorageEnabled()` returns false
 *   - All callers fall back to inline storage automatically
 *
 * On upload errors:
 *   - `uploadJsonToColdStorage` throws — the caller (generateAndPersist)
 *     catches and falls back to inline storage for that row, recording
 *     the failure on the row's `error` field. The Claude response itself
 *     is never lost.
 */

import { v2 as cloudinary } from "cloudinary";

export class ColdStorageNotConfiguredError extends Error {
  constructor() {
    super(
      "Cold storage is not configured. Set CLOUDINARY_URL in .env to upload AI logs.",
    );
    this.name = "ColdStorageNotConfiguredError";
  }
}

export class ColdStorageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ColdStorageUploadError";
  }
}

export function isCloudStorageEnabled(): boolean {
  const url = process.env.CLOUDINARY_URL;
  if (!url) return false;
  if (url.includes("placeholder")) return false;
  return url.startsWith("cloudinary://");
}

let configured = false;
function ensureConfigured() {
  if (!isCloudStorageEnabled()) throw new ColdStorageNotConfiguredError();
  if (configured) return;
  cloudinary.config({ secure: true });
  configured = true;
}

/**
 * Upload a JSON-serialisable value as a raw resource. The `publicId`
 * helps with discoverability and de-duplication in the Cloudinary
 * dashboard; pass a stable name like `prompt-${aiGenerationId}`.
 *
 * Returns the secure_url for storage in the DB.
 */
export async function uploadJsonToColdStorage(
  publicId: string,
  value: unknown,
): Promise<string> {
  ensureConfigured();

  let payload: string;
  try {
    payload = JSON.stringify(value);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "non-serialisable value";
    throw new ColdStorageUploadError(`Could not stringify payload: ${msg}`);
  }

  // The Cloudinary SDK accepts a data: URI for raw resources too. We use
  // base64 encoding so non-ASCII (e.g. accented characters from Lisbon
  // mission text) round-trip cleanly.
  const dataUri = `data:application/json;base64,${Buffer.from(payload, "utf-8").toString("base64")}`;

  try {
    const result = await cloudinary.uploader.upload(dataUri, {
      resource_type: "raw",
      folder: "solarpunk-missions/ai-logs",
      public_id: publicId,
      // Don't overwrite — every AiGeneration.id is unique so collisions
      // would be a sign of a bug, not a feature.
      overwrite: false,
      use_filename: false,
      unique_filename: false,
    });
    return result.secure_url;
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Cloudinary raw upload failed";
    throw new ColdStorageUploadError(msg);
  }
}

/**
 * Convenience reader for code that needs to materialise a cold-storage
 * blob back into memory. Uses the native fetch (Node 18+) and returns
 * the parsed JSON.
 *
 * Currently unused by any UI — kept here so the audit path is symmetric
 * and discoverable. If you need to backfill old rows, use this.
 */
export async function readJsonFromColdStorage<T = unknown>(
  url: string,
): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new ColdStorageUploadError(
      `Cold storage GET ${url} → HTTP ${res.status}`,
    );
  }
  return (await res.json()) as T;
}
