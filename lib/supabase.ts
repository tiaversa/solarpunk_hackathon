/**
 * Supabase Storage clients.
 *
 * The photo upload flow uses Supabase's signed-upload-URL pattern so the
 * browser uploads the raw File directly to Storage (no base64, no Vercel
 * body-size limit). Two clients live here:
 *
 *   - `getServerSupabase()` — uses the service-role key. Only callable from
 *     server code (route handlers, server components). It can mint signed
 *     upload URLs and signed read URLs regardless of RLS.
 *   - `getBrowserSupabase()` — uses the anon key. Used in the browser to
 *     POST the actual file bytes against a previously minted signed URL.
 *
 * Configuration: set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * and SUPABASE_SERVICE_ROLE_KEY in .env. See docs/STORAGE_SETUP.md for the
 * one-time bucket setup.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const PHOTO_BUCKET = "hackathon_images";

export class StorageNotConfiguredError extends Error {
  constructor(varName: string) {
    super(
      `Supabase Storage is not configured. Set ${varName} in .env to enable photo uploads.`,
    );
    this.name = "StorageNotConfiguredError";
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.includes("placeholder") || value.startsWith("CHANGE_ME")) {
    throw new StorageNotConfiguredError(name);
  }
  return value;
}

let _server: SupabaseClient | null = null;
/**
 * Service-role client for server-only code. Bypasses RLS. Never expose this
 * key to the browser — Next.js will refuse to inline it because it lacks the
 * NEXT_PUBLIC_ prefix.
 */
export function getServerSupabase(): SupabaseClient {
  if (_server) return _server;
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  _server = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _server;
}

let _browser: SupabaseClient | null = null;
/**
 * Anon client for browser code. Safe to ship to the client because it only
 * has the anon key. The signed upload tokens it consumes are minted by the
 * server route and tied to a specific object path, so this client cannot
 * write outside its allowed path.
 */
export function getBrowserSupabase(): SupabaseClient {
  if (_browser) return _browser;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new StorageNotConfiguredError(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  _browser = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _browser;
}

/**
 * Build a bucket-relative object path for a user's mission photo.
 *
 * Layout: `{userId}/{YYYY}/{MM}/{DD}/{uuid}.jpg`
 *
 * - The leading `{userId}/` segment lets us enforce ownership both via the
 *   path the server mints and (in a follow-up) via RLS policies on the
 *   bucket — the `photoPath.startsWith(\`${userId}/\`)` check in the
 *   complete route still holds because the userId stays first.
 * - The date partition is UTC so the same wall-clock day groups together
 *   regardless of where the server runs. Months and days are zero-padded
 *   so the Supabase dashboard lists folders in natural chronological
 *   order.
 * - Existing photos uploaded before this layout change keep their
 *   original `{userId}/{uuid}.jpg` paths — the value stored in
 *   `Completion.photoPath` is whatever was minted at upload time, so
 *   reads continue to work without any backfill.
 */
export function buildPhotoPath(userId: string, now: Date = new Date()): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${userId}/${year}/${month}/${day}/${uuid}.jpg`;
}

/**
 * Mint a short-lived signed URL the browser can use to GET the photo back.
 * Called at history-render time. Returns null when the path is null/empty
 * or when the bucket call fails (callers fall back to "no photo" rather
 * than failing the whole page).
 */
export async function signedReadUrl(
  path: string | null,
  expiresInSeconds = 60 * 60,
): Promise<string | null> {
  if (!path) return null;
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    // Storage not configured, network error, etc. — render without the
    // photo rather than blowing up the page.
    return null;
  }
}
