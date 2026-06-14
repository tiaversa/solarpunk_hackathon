import { z } from "npm:zod@3";
import { handleCors, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { getSupabaseAdmin } from "../_shared/supabase.ts";

const PrefsBody = z
  .object({
    city: z.string().max(100).optional(),
    interests: z.array(z.string().min(1).max(40)).max(20).optional(),
    preferredDuration: z.union([z.enum(["short", "medium", "long"]), z.null()]).optional(),
  })
  .refine(
    (v) => v.city !== undefined || v.interests !== undefined || v.preferredDuration !== undefined,
    { message: "Provide at least one of city, interests or preferredDuration" },
  );

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/user/, "");

  if (req.method === "PATCH" && path === "/preferences") {
    const auth = await requireUser(req);
    if (auth.error) return auth.error;

    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

    const parsed = PrefsBody.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);

    const update: Record<string, unknown> = {};
    if (parsed.data.city !== undefined) update["city"] = parsed.data.city;
    if (parsed.data.interests !== undefined) update["interests"] = parsed.data.interests;
    if (parsed.data.preferredDuration !== undefined) update["preferredDuration"] = parsed.data.preferredDuration;

    const supabase = getSupabaseAdmin();
    const { data: user } = await supabase
      .from("User")
      .update(update)
      .eq("id", auth.userId)
      .select("id, email, city, interests, preferredDuration")
      .single();

    // Invalidate preference summary cache when interests or duration change
    if (parsed.data.interests !== undefined || parsed.data.preferredDuration !== undefined) {
      await supabase.from("UserPreferenceSummary").delete().eq("userId", auth.userId);
    }

    return json({ user });
  }

  return json({ error: "Not found" }, 404);
});
