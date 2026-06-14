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
  const { data: user } = await supabase
    .from("User")
    .select("id, email, city, interests, preferredDuration")
    .eq("id", auth.userId)
    .single();

  if (!user) return json({ user: null }, 401);
  return json({ user });
});
