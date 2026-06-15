import { handleCors, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { getSupabaseAdmin } from "../_shared/supabase.ts";

const PHOTO_BUCKET = "hackathon_images";

function buildPhotoPath(userId: string): string {
  const now = new Date();
  const uuid = crypto.randomUUID();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${userId}/${year}/${month}/${day}/${uuid}.jpg`;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const auth = await requireUser(req);
  if (auth.error) return auth.error;

  const supabase = getSupabaseAdmin();

  // GET ?path=... → signed read URL (service-role bypasses bucket RLS)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const storagePath = url.searchParams.get("path");
    if (!storagePath) return json({ error: "Missing path" }, 400);
    // Enforce ownership: path must start with the authenticated user's ID
    if (!storagePath.startsWith(`${auth.userId}/`)) {
      return json({ error: "Forbidden" }, 403);
    }
    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(storagePath, 60 * 60);
    if (error || !data?.signedUrl) {
      return json({ error: error?.message ?? "Object not found" }, 404);
    }
    return json({ signedUrl: data.signedUrl });
  }

  // POST → signed upload URL
  if (req.method === "POST") {
    const path = buildPhotoPath(auth.userId);
    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data?.token) {
      return json({ error: error?.message ?? "Could not mint upload URL" }, 502);
    }
    return json({ path, token: data.token });
  }

  return json({ error: "Method not allowed" }, 405);
});
