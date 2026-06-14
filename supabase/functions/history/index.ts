import { handleCors, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { getSupabaseAdmin } from "../_shared/supabase.ts";

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

    return { id: r.id, topic: r.topic, level: r.level, title, brief, duration, note: r.note, photoUrl: r.photoUrl, completedAt: r.createdAt };
  });

  const totalsByTopic: Record<string, number> = {};
  for (const item of items) {
    totalsByTopic[item.topic] = (totalsByTopic[item.topic] ?? 0) + 1;
  }

  return json({ items, totalsByTopic });
});
