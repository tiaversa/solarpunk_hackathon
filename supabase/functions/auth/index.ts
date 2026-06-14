import { z } from "npm:zod@3";
import { handleCors, json } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabase.ts";

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  org: z
    .object({
      name: z.string().min(2).max(120),
      description: z.string().max(500).optional(),
      city: z.string().max(100).optional(),
    })
    .optional(),
});

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/auth/, "");

  if (req.method === "POST" && path === "/register") {
    return handleRegister(req);
  }

  return json({ error: "Not found" }, 404);
});

async function handleRegister(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = RegisterBody.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
  }

  const supabase = getSupabaseAdmin();
  const email = parsed.data.email.toLowerCase();

  // Check if user already exists in public.User
  const { data: existing } = await supabase
    .from("User")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return json({ error: "An account with that email already exists" }, 409);
  }

  if (parsed.data.org) {
    const { data: orgEmailTaken } = await supabase
      .from("Organization")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (orgEmailTaken) {
      return json({ error: "An organisation with that email already exists" }, 409);
    }
  }

  // Create auth user — Supabase Auth handles password hashing
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: parsed.data.password,
    email_confirm: true, // skip email verification for hackathon
  });

  if (authError || !authData.user) {
    return json({ error: authError?.message ?? "Failed to create user" }, 500);
  }

  // The trigger handle_new_auth_user auto-creates the User profile row.
  // Fetch it so we can return the internal id.
  const { data: profile } = await supabase
    .from("User")
    .select("id, email")
    .eq("authId", authData.user.id)
    .single();

  if (parsed.data.org) {
    const { name, description, city } = parsed.data.org;
    const { data: org, error: orgError } = await supabase
      .from("Organization")
      .insert({
        name,
        description,
        city,
        email,
        createdByUserId: profile!.id,
      })
      .select("id, name")
      .single();

    if (orgError) {
      // Roll back auth user if org creation fails
      await supabase.auth.admin.deleteUser(authData.user.id);
      return json({ error: "Failed to create organisation" }, 500);
    }

    return json({ user: profile, org }, 201);
  }

  return json({ user: profile }, 201);
}
