import { z } from "npm:zod@3";
import { handleCors, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { getSupabaseAdmin } from "../_shared/supabase.ts";
import { isTopicId, TOPIC_IDS } from "../_shared/missionMatrix.ts";

const Body = z.object({
  topic: z.string().refine(isTopicId, { message: `topic must be one of: ${TOPIC_IDS.join(", ")}` }),
});

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/topic/, "");

  if (req.method === "POST" && path === "/reset") {
    const auth = await requireUser(req);
    if (auth.error) return auth.error;

    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

    const parsed = Body.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);

    const { topic } = parsed.data;
    const supabase = getSupabaseAdmin();

    await supabase
      .from("MissionChoice")
      .update({ status: "abandoned" })
      .eq("userId", auth.userId).eq("topic", topic).eq("status", "active");

    const { data: progress } = await supabase
      .from("Progress")
      .update({ currentLevel: 1, completedLevels: [] })
      .eq("userId", auth.userId)
      .eq("topic", topic)
      .select("topic, currentLevel, completedLevels")
      .single();

    return json({ progress });
  }

  return json({ error: "Not found" }, 404);
});
