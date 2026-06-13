import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth-helper";
import {
  PHOTO_BUCKET,
  buildPhotoPath,
  getServerSupabase,
  StorageNotConfiguredError,
} from "@/lib/supabase";

/**
 * Mint a single-use signed upload URL for a mission completion photo.
 *
 *   POST /api/photo/upload-url   →  { path, token }
 *
 * The browser then uses the token with
 * `supabase.storage.from(PHOTO_BUCKET).uploadToSignedUrl(path, token, file)`
 * to push the bytes directly to Storage — no payload through this route.
 *
 * Auth: must be signed in. The path is server-chosen and scoped to the
 * caller's userId so a client can never upload outside its own folder.
 */
export async function POST() {
  const auth = await requireUserId();
  if (auth.response) return auth.response;

  const path = buildPhotoPath(auth.userId);

  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data?.token) {
      const msg = error?.message ?? "Could not mint upload URL";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    return NextResponse.json({ path, token: data.token });
  } catch (err) {
    if (err instanceof StorageNotConfiguredError) {
      return NextResponse.json(
        {
          error:
            "Photo uploads aren’t configured yet. Set Supabase Storage env vars, or submit without a photo.",
        },
        { status: 503 },
      );
    }
    throw err;
  }
}
