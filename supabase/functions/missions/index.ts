import { z } from "npm:zod@3";
import Anthropic from "npm:@anthropic-ai/sdk";
import { handleCors, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { getSupabaseAdmin } from "../_shared/supabase.ts";
import {
  isTopicId,
  TOPIC_IDS,
  matrixCellText,
  getTopic,
  type TopicId,
} from "../_shared/missionMatrix.ts";
import {
  isLevel,
  levelLabel,
  MIN_LEVEL,
  MAX_LEVEL,
  type Level,
} from "../_shared/levels.ts";

// ---- Constants ---------------------------------------------------------------
const MISSION_OPTIONS_COUNT = 3;
const MISSION_MAX_TOKENS = 1024;
const MISSION_MODEL = "claude-sonnet-4-5";
const MISSION_PROMPT_VERSION = "v1.0";

// ---- Zod schemas -------------------------------------------------------------
const MissionOption = z.object({
  title: z.string().min(1).max(120),
  brief: z.string().min(1).max(800),
  tip: z.string().min(1).max(400),
  duration: z.enum(["short", "medium", "long"]),
  communityRequest: z.string().max(200).optional(),
});
type MissionOption = z.infer<typeof MissionOption>;
const MissionOptionsArray = z.array(MissionOption).length(MISSION_OPTIONS_COUNT);

const GetQuery = z.object({
  topic: z.string().refine(isTopicId, { message: `topic must be one of: ${TOPIC_IDS.join(", ")}` }),
  level: z.coerce.number().int().refine(isLevel, { message: `level must be an integer ${MIN_LEVEL}-${MAX_LEVEL}` }),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

const ChooseBody = z.object({
  topic: z.string().refine(isTopicId, { message: `topic must be one of: ${TOPIC_IDS.join(", ")}` }),
  level: z.number().int().refine(isLevel, { message: `level must be an integer ${MIN_LEVEL}-${MAX_LEVEL}` }),
  aiGenerationId: z.string().uuid(),
  chosenIndex: z.number().int().min(0).max(MISSION_OPTIONS_COUNT - 1),
});

const CompleteBody = z.object({
  topic: z.string().refine(isTopicId, { message: `topic must be one of: ${TOPIC_IDS.join(", ")}` }),
  level: z.number().int().refine(isLevel, { message: `level must be an integer ${MIN_LEVEL}-${MAX_LEVEL}` }),
  aiGenerationId: z.string().uuid(),
  chosenIndex: z.number().int().min(0).max(MISSION_OPTIONS_COUNT - 1),
  note: z.string().max(2000).optional(),
  photoPath: z.string().max(500).optional(),
});

const RegenerateBody = z.object({
  topic: z.string().refine(isTopicId, { message: `topic must be one of: ${TOPIC_IDS.join(", ")}` }),
  level: z.number().int().refine(isLevel, { message: `level must be an integer ${MIN_LEVEL}-${MAX_LEVEL}` }),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

// ---- Router ------------------------------------------------------------------
Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/missions/, "");

  if (req.method === "GET" && path === "") return handleGetMission(req);
  if (req.method === "POST" && path === "/choose") return handleChoose(req);
  if (req.method === "POST" && path === "/complete") return handleComplete(req);
  if (req.method === "POST" && path === "/regenerate") return handleRegenerate(req);

  return json({ error: "Not found" }, 404);
});

// ---- GET / -------------------------------------------------------------------
async function handleGetMission(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const parsed = GetQuery.safeParse({
    topic: url.searchParams.get("topic") ?? "",
    level: url.searchParams.get("level") ?? "",
    lat: url.searchParams.get("lat") ?? undefined,
    lng: url.searchParams.get("lng") ?? undefined,
  });
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid query" }, 400);

  try {
    const result = await getOrGenerateMission({
      userId: auth.userId,
      topic: parsed.data.topic as TopicId,
      level: parsed.data.level as Level,
      latitude: parsed.data.lat,
      longitude: parsed.data.lng,
    });
    return json(result);
  } catch (err) {
    if (err instanceof MissionGenerationError) {
      return json({ error: err.message, aiGenerationId: err.aiGenerationId }, 502);
    }
    throw err;
  }
}

// ---- POST /choose ------------------------------------------------------------
async function handleChoose(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const parsed = ChooseBody.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);

  const { aiGenerationId, chosenIndex } = parsed.data;
  const topic = parsed.data.topic as TopicId;
  const level = parsed.data.level as Level;
  const supabase = getSupabaseAdmin();

  const { data: generation } = await supabase
    .from("AiGeneration")
    .select("parsedOptions")
    .eq("id", aiGenerationId)
    .eq("userId", auth.userId)
    .eq("topic", topic)
    .eq("level", level)
    .eq("status", "active")
    .not("parsedOptions", "is", null)
    .maybeSingle();

  if (!generation) return json({ error: "No active mission generation for that (topic, level)" }, 404);

  const { data: existing } = await supabase
    .from("MissionChoice")
    .select("id")
    .eq("userId", auth.userId)
    .eq("topic", topic)
    .eq("level", level)
    .eq("status", "active")
    .maybeSingle();

  let row;
  if (existing) {
    const { data } = await supabase
      .from("MissionChoice")
      .update({ aiGenerationId, chosenIndex, optionsPresented: generation.parsedOptions })
      .eq("id", existing.id)
      .select("id, status")
      .single();
    row = data;
  } else {
    const { data } = await supabase
      .from("MissionChoice")
      .insert({ userId: auth.userId, topic, level, aiGenerationId, optionsPresented: generation.parsedOptions, chosenIndex })
      .select("id, status")
      .single();
    row = data;
  }

  return json({ missionChoiceId: row?.id, status: row?.status });
}

// ---- POST /complete ----------------------------------------------------------
async function handleComplete(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const parsed = CompleteBody.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);

  const { aiGenerationId, chosenIndex, note, photoPath } = parsed.data;
  const topic = parsed.data.topic as TopicId;
  const level = parsed.data.level as Level;
  const supabase = getSupabaseAdmin();

  const { data: generation } = await supabase
    .from("AiGeneration")
    .select("id")
    .eq("id", aiGenerationId)
    .eq("userId", auth.userId)
    .eq("topic", topic)
    .eq("level", level)
    .maybeSingle();
  if (!generation) return json({ error: "Unknown aiGenerationId for that (topic, level)" }, 404);

  // Validate path ownership — the server-minted path always starts with the
  // user's own userId segment so a client cannot point at another user's file.
  if (photoPath && !photoPath.startsWith(`${auth.userId}/`)) {
    return json({ error: "Invalid photo path" }, 403);
  }

  // a. Insert completion
  await supabase.from("Completion").insert({
    userId: auth.userId, topic, level, aiGenerationId,
    chosenMissionIndex: chosenIndex, photoUrl: photoPath ?? null, note: note ?? null,
  });

  // b. Mark active MissionChoice completed
  await supabase.from("MissionChoice")
    .update({ status: "completed" })
    .eq("userId", auth.userId).eq("topic", topic).eq("level", level).eq("status", "active");

  // c. Advance progress
  const { data: current } = await supabase
    .from("Progress")
    .select("completedLevels")
    .eq("userId", auth.userId)
    .eq("topic", topic)
    .maybeSingle();

  const prevCompleted: number[] = current?.completedLevels ?? [];
  const completedLevels = prevCompleted.includes(level)
    ? prevCompleted
    : [...prevCompleted, level].sort((a, b) => a - b);
  const nextLevel = level < MAX_LEVEL ? level + 1 : MAX_LEVEL;

  const { data: updatedProgress } = await supabase
    .from("Progress")
    .update({ currentLevel: nextLevel, completedLevels })
    .eq("userId", auth.userId)
    .eq("topic", topic)
    .select("topic, currentLevel, completedLevels")
    .single();

  // Fire-and-forget: pre-cache next level
  if (level < MAX_LEVEL) {
    void getOrGenerateMission({ userId: auth.userId, topic, level: (level + 1) as Level }).catch(() => {});
  }

  return json({ progress: updatedProgress });
}

// ---- POST /regenerate --------------------------------------------------------
async function handleRegenerate(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const parsed = RegenerateBody.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);

  const topic = parsed.data.topic as TopicId;
  const level = parsed.data.level as Level;
  const supabase = getSupabaseAdmin();

  await supabase.from("AiGeneration")
    .update({ status: "regenerated" })
    .eq("userId", auth.userId).eq("topic", topic).eq("level", level).eq("status", "active");

  await supabase.from("MissionChoice")
    .update({ status: "abandoned" })
    .eq("userId", auth.userId).eq("topic", topic).eq("level", level).eq("status", "active");

  try {
    const result = await generateAndPersist(
      { userId: auth.userId, topic, level, latitude: parsed.data.lat, longitude: parsed.data.lng },
      { isRegeneration: true },
    );
    return json(result);
  } catch (err) {
    if (err instanceof MissionGenerationError) {
      return json({ error: err.message, aiGenerationId: err.aiGenerationId }, 502);
    }
    throw err;
  }
}

// ---- Mission generation core -------------------------------------------------
class MissionGenerationError extends Error {
  constructor(message: string, public readonly aiGenerationId: string | null) {
    super(message);
    this.name = "MissionGenerationError";
  }
}

type CoreInput = {
  userId: string;
  topic: TopicId;
  level: Level;
  latitude?: number | null;
  longitude?: number | null;
};

async function getOrGenerateMission(input: CoreInput) {
  const supabase = getSupabaseAdmin();
  const { data: cached } = await supabase
    .from("AiGeneration")
    .select("id, parsedOptions")
    .eq("userId", input.userId)
    .eq("topic", input.topic)
    .eq("level", input.level)
    .eq("status", "active")
    .not("parsedOptions", "is", null)
    .order("createdAt", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached?.parsedOptions) {
    const parsed = MissionOptionsArray.safeParse(cached.parsedOptions);
    if (parsed.success) return { aiGenerationId: cached.id, options: parsed.data, fromCache: true };
  }

  return generateAndPersist(input, { isRegeneration: false });
}

async function generateAndPersist(input: CoreInput, opts: { isRegeneration: boolean }) {
  const supabase = getSupabaseAdmin();

  const { data: user } = await supabase
    .from("User")
    .select("city, interests, preferredDuration")
    .eq("id", input.userId)
    .single();
  if (!user) throw new MissionGenerationError("User not found", null);

  const cell = matrixCellText(input.topic, input.level);
  const label = levelLabel(input.level);
  const city = (user.city ?? "").trim();

  const preferenceSummary = await getCachedPreferenceSummary(input.userId);

  const nearbyOpportunities =
    input.level >= 2 && input.latitude != null && input.longitude != null
      ? await findNearbyOpportunities(input.topic, input.latitude, input.longitude).catch(() => [])
      : [];

  const preferredDuration =
    user.preferredDuration === "short" || user.preferredDuration === "medium" || user.preferredDuration === "long"
      ? user.preferredDuration
      : null;

  let prompt = buildMissionPrompt({
    topic: input.topic, level: input.level, city,
    latitude: input.latitude, longitude: input.longitude,
    matrixCellText: cell, missionTypeLabel: label,
    interests: user.interests ?? [], preferredDuration, preferenceSummary,
    nearbyOpportunities,
  });
  if (opts.isRegeneration) {
    prompt += "\n\nThis is a regeneration — vary the angles from a previous response.";
  }

  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  let rawText = "";
  let rawResponse: unknown;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let callError: string | null = null;

  try {
    const response = await client.messages.create({
      model: MISSION_MODEL,
      max_tokens: MISSION_MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });
    rawResponse = response;
    inputTokens = response.usage?.input_tokens ?? null;
    outputTokens = response.usage?.output_tokens ?? null;
    for (const block of response.content) {
      if (block.type === "text") rawText += block.text;
    }
  } catch (err) {
    callError = err instanceof Error ? `${err.name}: ${err.message}` : "Unknown Claude error";
  }

  let parsedOptions: MissionOption[] | null = null;
  if (!callError) {
    try { parsedOptions = parseClaudeJsonArray(rawText); }
    catch (err) { callError = err instanceof Error ? err.message : "Parse error"; }
  }

  const rowId = crypto.randomUUID();
  const { data: row } = await supabase.from("AiGeneration").insert({
    id: rowId,
    userId: input.userId,
    topic: input.topic,
    level: input.level,
    missionTypeLabel: label,
    matrixCellText: cell,
    city,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    promptSent: prompt,
    promptVersion: MISSION_PROMPT_VERSION,
    preferenceSummarySent: preferenceSummary,
    model: MISSION_MODEL,
    rawResponse: rawResponse ?? null,
    parsedOptions: parsedOptions ?? null,
    optionsCount: parsedOptions?.length ?? MISSION_OPTIONS_COUNT,
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - t0,
    error: callError,
    status: "active",
    startedAt,
    completedAt: new Date().toISOString(),
  }).select("id").single();

  if (callError || !parsedOptions) {
    throw new MissionGenerationError(callError ?? "Claude returned an unusable response", row?.id ?? null);
  }

  return { aiGenerationId: row!.id, options: parsedOptions, fromCache: false };
}

// ---- Prompt builder ----------------------------------------------------------
type NearbyOpportunity = { orgName: string; title: string; description: string; distanceKm: number };

function buildMissionPrompt(input: {
  topic: TopicId; level: number; city: string;
  latitude?: number | null; longitude?: number | null;
  matrixCellText: string; missionTypeLabel: string;
  interests: string[]; preferredDuration: string | null;
  preferenceSummary: string | null; nearbyOpportunities?: NearbyOpportunity[];
}): string {
  const topicMeta = getTopic(input.topic);
  const interestsLine = input.interests.length > 0
    ? input.interests.map((s) => `"${s}"`).join(", ")
    : "(none yet)";
  const durationLine = input.preferredDuration
    ? `Prefers ${input.preferredDuration}-length missions when possible.`
    : `No strong duration preference yet — vary across short / medium / long.`;
  const summaryLine = input.preferenceSummary
    ? `Past behaviour: ${input.preferenceSummary}`
    : `No completed missions yet — this is a fresh learner.`;
  const locationLine = input.latitude != null && input.longitude != null
    ? `Learner is in ${input.city || "their local area"} (GPS: ${input.latitude.toFixed(4)}, ${input.longitude.toFixed(4)} — prioritise places within a few km).`
    : `Learner is in ${input.city || "their local area"}.`;

  const opportunitiesBlock = input.nearbyOpportunities && input.nearbyOpportunities.length > 0
    ? [
        ``,
        `Nearby community opportunities — real open requests from local organisations:`,
        ...input.nearbyOpportunities.map((o, i) =>
          `  ${i + 1}. ${o.orgName}: "${o.title}" — ${o.description} (${o.distanceKm.toFixed(1)} km away)`,
        ),
        `For at least one option, design it so the learner could directly help fulfil one of these requests.`,
        `When an option is directly inspired by one of those requests, add a "communityRequest" key with the value "<OrgName>: <RequestTitle>" (e.g. "Cruz Roja: We need translator to braille"). Omit the key for generic options.`,
      ]
    : [];

  return [
    `You are designing real-world learning missions for the Solarpunk Missions app.`,
    `Solarpunk values: community, sustainability, hands-on learning, repair-over-replace, joyful curiosity.`,
    ``,
    `Topic: ${topicMeta.label} ${topicMeta.emoji} (id: ${input.topic})`,
    `Level ${input.level} of 6 — "${input.missionTypeLabel}". Seed brief: "${input.matrixCellText}".`,
    locationLine, `Stated interests: ${interestsLine}.`, durationLine, summaryLine,
    ...opportunitiesBlock,
    ``,
    `Generate exactly 3 mission options, each different in approach or angle.`,
    `Each must be doable in one day with no specialised equipment, grounded in the learner's city.`,
    ``,
    `Output rules:`,
    `- Return ONLY a raw JSON array. No prose, no markdown fences.`,
    `- Exactly 3 items with keys: "title" (<=60 chars), "brief" (1-2 sentences), "tip" (1 sentence), "duration" ("short"|"medium"|"long"), and optionally "communityRequest" (string, only when tied to a nearby request).`,
    `- Strict JSON parseable by JSON.parse.`,
  ].join("\n");
}

// ---- Preference summary -------------------------------------------------------
async function getCachedPreferenceSummary(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data: cached } = await supabase
    .from("UserPreferenceSummary").select("summary").eq("userId", userId).maybeSingle();
  if (cached) return cached.summary;

  const { data: rows } = await supabase
    .from("MissionChoice")
    .select("topic, chosenIndex, optionsPresented")
    .eq("userId", userId)
    .eq("status", "completed")
    .order("chosenAt", { ascending: false })
    .limit(50);

  if (!rows || rows.length === 0) return null;

  const topicCounts = new Map<string, number>();
  const chosenTitles: string[] = [];
  const durationCounts = new Map<string, number>();

  for (const row of rows) {
    topicCounts.set(row.topic, (topicCounts.get(row.topic) ?? 0) + 1);
    const opts = Array.isArray(row.optionsPresented) ? row.optionsPresented : [];
    const chosen = opts[row.chosenIndex];
    if (chosen && typeof chosen === "object") {
      const o = chosen as { title?: unknown; duration?: unknown };
      if (typeof o.title === "string") chosenTitles.push(o.title);
      if (o.duration === "short" || o.duration === "medium" || o.duration === "long") {
        durationCounts.set(o.duration, (durationCounts.get(o.duration) ?? 0) + 1);
      }
    }
  }

  const topTopics = [...topicCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
  const topDuration = [...durationCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const recent = chosenTitles.slice(0, 3);

  const parts = [`${rows.length} mission(s) completed so far`];
  if (topTopics.length > 0) parts.push(`favourite topics: ${topTopics.join(", ")}`);
  if (topDuration) parts.push(`tends to pick ${topDuration} missions`);
  if (recent.length > 0) parts.push(`recent picks: "${recent.join('", "')}"`);
  const summary = parts.join("; ") + ".";

  await supabase.from("UserPreferenceSummary")
    .upsert({ userId, summary, basedOn: rows.length }, { onConflict: "userId" });

  return summary;
}

// ---- Nearby opportunities ----------------------------------------------------
async function findNearbyOpportunities(topic: TopicId, lat: number, lng: number): Promise<NearbyOpportunity[]> {
  const supabase = getSupabaseAdmin();
  const BBOX_DEG = 0.15;
  const MAX_RADIUS_KM = 10;
  const MAX_RESULTS = 3;

  const { data: rows } = await supabase
    .from("ServiceRequest")
    .select("title, description, lat, lng, Organization(name)")
    .eq("category", topic)
    .eq("status", "open")
    .gt("capacityRemaining", 0)
    .gte("lat", lat - BBOX_DEG).lte("lat", lat + BBOX_DEG)
    .gte("lng", lng - BBOX_DEG).lte("lng", lng + BBOX_DEG)
    .limit(MAX_RESULTS * 5);

  if (!rows) return [];

  return (rows as Array<{ title: string; description: string; lat: number; lng: number; Organization: { name: string } }>)
    .map((r) => ({
      orgName: r.Organization.name,
      title: r.title,
      description: r.description,
      distanceKm: haversineKm(lat, lng, r.lat, r.lng),
    }))
    .filter((r) => r.distanceKm <= MAX_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_RESULTS);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function toRad(deg: number) { return (deg * Math.PI) / 180; }

// ---- JSON parser -------------------------------------------------------------
function parseClaudeJsonArray(text: string): MissionOption[] {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Empty response from Claude");
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("Could not find JSON array in Claude response");
  const slice = trimmed.slice(start, end + 1);
  let parsed: unknown;
  try { parsed = JSON.parse(slice); } catch (err) {
    throw new Error(`Invalid JSON: ${err instanceof Error ? err.message : "parse failed"}`);
  }
  const result = MissionOptionsArray.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Schema mismatch: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return result.data;
}
