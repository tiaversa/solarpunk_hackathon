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

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (auth.error) return auth.error;

  const path = buildPhotoPath(auth.userId);
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data?.token) {
    return json({ error: error?.message ?? "Could not mint upload URL" }, 502);
  }

  return json({ path, token: data.token });
});
