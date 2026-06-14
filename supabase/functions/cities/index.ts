import { handleCors, json } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();

  if (q.length < 2) return json([]);

  const supabase = getSupabaseAdmin();

  // Use pg_trgm similarity for fuzzy matching (seeded by scripts/seed-cities.mjs)
  const { data, error } = await supabase
    .from("cities")
    .select("name, country, admin1")
    .ilike("name", `${q}%`)
    .limit(8);

  if (error) return json({ error: error.message }, 500);
  return json(data ?? []);
});
