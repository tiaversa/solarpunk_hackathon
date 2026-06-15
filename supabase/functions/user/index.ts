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

const ProfileBody = z
  .object({
    bio: z.string().max(300).nullable().optional(),
    phone: z.string().max(30).nullable().optional(),
  })
  .refine(
    (v) => v.bio !== undefined || v.phone !== undefined,
    { message: "Provide at least one of bio or phone" },
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

  if (req.method === "PATCH" && path === "/profile") {
    const auth = await requireUser(req);
    if (auth.error) return auth.error;

    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

    const parsed = ProfileBody.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);

    const update: Record<string, unknown> = {};
    if (parsed.data.bio !== undefined) update["bio"] = parsed.data.bio;
    if (parsed.data.phone !== undefined) update["phone"] = parsed.data.phone;

    const supabase = getSupabaseAdmin();
    const { data: user } = await supabase
      .from("User")
      .update(update)
      .eq("id", auth.userId)
      .select("id, email, bio, phone")
      .single();

    return json({ user });
  }

  if (req.method === "GET" && path === "/profile") {
    const auth = await requireUser(req);
    if (auth.error) return auth.error;

    const supabase = getSupabaseAdmin();
    const { data: user } = await supabase
      .from("User")
      .select("id, email, bio, phone")
      .eq("id", auth.userId)
      .single();

    if (!user) return json({ error: "User not found" }, 404);

    // Include the user's org if they have one
    const { data: org } = await supabase
      .from("Organization")
      .select("id, name, description, phone")
      .eq("createdByUserId", auth.userId)
      .maybeSingle();

    return json({ user, org: org ?? null });
  }

  return json({ error: "Not found" }, 404);
});
