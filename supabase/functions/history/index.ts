import { handleCors, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { getSupabaseAdmin } from "../_shared/supabase.ts";

const PHOTO_BUCKET = "hackathon_images";
const SIGNED_URL_TTL = 60 * 60; // 1 hour

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req);
  if (auth.error) return auth.error;

  const supabase = getSupabaseAdmin();

  const { data: rows } = await supabase
    .from("Completion")
    .select("id, topic, level, aiGenerationId, chosenMissionIndex, note, photoUrl, createdAt")
    .eq("userId", auth.userId)
    .order("createdAt", { ascending: false });

  if (!rows) return json({ items: [], totalsByTopic: {} });

  const genIds = [...new Set(rows.map((r) => r.aiGenerationId).filter(Boolean) as string[])];
  const { data: generations } = genIds.length > 0
    ? await supabase.from("AiGeneration").select("id, parsedOptions").in("id", genIds)
    : { data: [] };

  const parsedOptionsById = new Map((generations ?? []).map((g) => [g.id, g.parsedOptions]));

  const items = rows.map((r) => {
    let title: string | null = null;
    let brief: string | null = null;
    let duration: "short" | "medium" | "long" | null = null;

    const opts = r.aiGenerationId ? parsedOptionsById.get(r.aiGenerationId) : null;
    if (Array.isArray(opts) && r.chosenMissionIndex !== null) {
      const chosen = opts[r.chosenMissionIndex] as { title?: unknown; brief?: unknown; duration?: unknown } | undefined;
      if (chosen) {
        if (typeof chosen.title === "string") title = chosen.title;
        if (typeof chosen.brief === "string") brief = chosen.brief;
        if (chosen.duration === "short" || chosen.duration === "medium" || chosen.duration === "long") {
          duration = chosen.duration;
        }
      }
    }

    return { id: r.id, topic: r.topic, level: r.level, title, brief, duration, note: r.note, photoPath: r.photoUrl, completedAt: r.createdAt };
  });

  // Generate signed read URLs for any completion photos using the service-role
  // key so bucket RLS policies are bypassed. The client can't do this itself
  // with just the anon key on a private bucket.
  const photoPaths = [...new Set(items.map((i) => i.photoPath).filter(Boolean) as string[])];
  const signedUrlMap = new Map<string, string>();
  if (photoPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(photoPaths, SIGNED_URL_TTL);
    for (const entry of signed ?? []) {
      if (entry.signedUrl && entry.path) signedUrlMap.set(entry.path, entry.signedUrl);
    }
  }

  const itemsWithUrls = items.map((i) => ({
    ...i,
    photoUrl: i.photoPath ? (signedUrlMap.get(i.photoPath) ?? null) : null,
    photoPath: undefined,
  }));

  const totalsByTopic: Record<string, number> = {};
  for (const item of items) {
    totalsByTopic[item.topic] = (totalsByTopic[item.topic] ?? 0) + 1;
  }

  return json({ items: itemsWithUrls, totalsByTopic });
});
