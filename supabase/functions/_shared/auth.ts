import { getSupabaseAdmin } from "./supabase.ts";
import { json } from "./cors.ts";

export type AuthResult =
  | { userId: string; authUserId: string; error?: never }
  | { userId?: never; authUserId?: never; error: Response };

export async function requireUser(req: Request): Promise<AuthResult> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return { error: json({ error: "Missing authorization token" }, 401) };
  }

  const supabase = getSupabaseAdmin();

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { error: json({ error: "Invalid or expired token" }, 401) };
  }

  const { data: profile, error: profileError } = await supabase
    .from("User")
    .select("id")
    .eq("authId", user.id)
    .single();

  if (profileError || !profile) {
    return { error: json({ error: "User profile not found" }, 404) };
  }

  return { userId: profile.id, authUserId: user.id };
}
