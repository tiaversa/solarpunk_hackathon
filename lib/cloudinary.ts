/**
 * Cloudinary upload helper.
 *
 * Accepts a base64 image (raw string OR `data:image/...;base64,...` URI)
 * and returns the hosted URL.
 *
 * Configuration: reads CLOUDINARY_URL from the environment. If it's missing
 * or still set to the placeholder shipped in `.env.example`, we surface a
 * clear `CloudinaryNotConfiguredError` so the calling route can choose to
 * return a friendly 503 instead of silently dropping the photo.
 *
 * Mission completion without a photo never touches this module — that
 * flow keeps working even when Cloudinary isn't configured.
 */

import { v2 as cloudinary } from "cloudinary";

export class CloudinaryNotConfiguredError extends Error {
  constructor() {
    super(
      "Cloudinary is not configured. Set CLOUDINARY_URL in .env to enable photo uploads.",
    );
    this.name = "CloudinaryNotConfiguredError";
  }
}

export class CloudinaryUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudinaryUploadError";
  }
}

function isConfigured(): boolean {
  const url = process.env.CLOUDINARY_URL;
  if (!url) return false;
  // Reject the placeholder shipped in .env.example
  if (url.includes("placeholder")) return false;
  // Sanity check the scheme
  return url.startsWith("cloudinary://");
}

// One-time config call. The Cloudinary SDK reads CLOUDINARY_URL implicitly
// when constructed, but calling config() explicitly makes the dependency
// obvious and lets us re-read in dev with hot-reload.
let configured = false;
function ensureConfigured() {
  if (!isConfigured()) throw new CloudinaryNotConfiguredError();
  if (configured) return;
  cloudinary.config({ secure: true });
  configured = true;
}

/**
 * Upload a base64-encoded image and return the secure CDN URL.
 *
 * Mission completion photos are reasonably small (we keep them client-side
 * compressed to ~1 MB) so a single sync upload is fine. We never block the
 * transaction on this — see /api/mission/complete: the upload runs BEFORE
 * the prisma.$transaction() so a failed upload aborts cleanly without
 * partial DB state.
 */
export async function uploadPhotoBase64(base64: string): Promise<string> {
  ensureConfigured();

  const trimmed = base64.trim();
  if (!trimmed) throw new CloudinaryUploadError("Empty photo body");

  // The SDK accepts either a data: URI or a raw base64 string prefixed
  // with the data: form. Normalise to a data URI when missing.
  const payload = trimmed.startsWith("data:")
    ? trimmed
    : `data:image/jpeg;base64,${trimmed}`;

  try {
    const result = await cloudinary.uploader.upload(payload, {
      folder: "solarpunk-missions",
      resource_type: "image",
      // Strip identifying EXIF metadata server-side.
      invalidate: true,
    });
    return result.secure_url;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Cloudinary upload failed";
    throw new CloudinaryUploadError(msg);
  }
}
