import { z } from "npm:zod@3";
import { handleCors, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { getSupabaseAdmin } from "../_shared/supabase.ts";
import { isTopicId, TOPIC_IDS } from "../_shared/missionMatrix.ts";

const PostBody = z.object({
  topic: z.string().refine(isTopicId, { message: `topic must be one of: ${TOPIC_IDS.join(", ")}` }),
});

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const auth = await requireUser(req);
  if (auth.error) return auth.error;

  const supabase = getSupabaseAdmin();

  if (req.method === "GET") {
    const { data: rows } = await supabase
      .from("Progress")
      .select("topic, currentLevel, completedLevels")
      .eq("userId", auth.userId)
      .order("createdAt", { ascending: true });
    return json(rows ?? []);
  }

  if (req.method === "POST") {
    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

    const parsed = PostBody.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);

    const { data: upserted } = await supabase
      .from("Progress")
      .upsert({ userId: auth.userId, topic: parsed.data.topic }, { onConflict: "userId,topic", ignoreDuplicates: true })
      .select("topic, currentLevel, completedLevels")
      .single();

    // ignoreDuplicates skips the insert when the row already exists, returning
    // null. Fall back to a SELECT so the client always gets a valid row.
    const row = upserted ?? (await supabase
      .from("Progress")
      .select("topic, currentLevel, completedLevels")
      .eq("userId", auth.userId)
      .eq("topic", parsed.data.topic)
      .single()
    ).data;

    return json(row, 201);
  }

  return json({ error: "Method not allowed" }, 405);
});
