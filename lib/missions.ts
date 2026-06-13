/**
 * Mission generation core — shared between the GET /api/mission route handler
 * and the server-rendered viewer page so neither has to round-trip through
 * HTTP.
 *
 * The exported `getOrGenerateMission` implements the spec for Step 4:
 *
 *   1. Authenticate (caller is responsible — we take a userId).
 *   2. Cache check: an existing AiGeneration row for (userId, topic, level)
 *      with status='active' AND error IS NULL wins; we just return its
 *      parsedOptions.
 *   3. Else: build prompt with city / interests / preferredDuration /
 *      preference summary, call Claude, parse strict JSON, persist a new
 *      AiGeneration row (status='active'), return the parsed options.
 *
 * On Claude or parse failure we still persist the AiGeneration row (with
 * `error` populated and parsedOptions=null) so the failure is observable in
 * the DB, then throw `MissionGenerationError` to the caller. Because the
 * cache filter requires error IS NULL, the next request will retry.
 */

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { anthropic, MISSION_MODEL } from "@/lib/anthropic";
import {
  MISSION_PROMPT_VERSION,
  buildMissionPrompt,
  getCachedPreferenceSummary,
  type Duration,
} from "@/lib/missionPrompt";
import { matrixCellText, type TopicId } from "@/lib/missionMatrix";
import { levelLabel, type Level } from "@/lib/levels";
import { randomUUID } from "node:crypto";

export const MISSION_OPTIONS_COUNT = 3;
export const MISSION_MAX_TOKENS = 1024;

export const MissionOption = z.object({
  title: z.string().min(1).max(120),
  brief: z.string().min(1).max(800),
  tip: z.string().min(1).max(400),
  duration: z.enum(["short", "medium", "long"]),
});
export type MissionOption = z.infer<typeof MissionOption>;

const MissionOptionsArray = z
  .array(MissionOption)
  .length(MISSION_OPTIONS_COUNT);

export type MissionResult = {
  aiGenerationId: string;
  options: MissionOption[];
  fromCache: boolean;
};

export class MissionGenerationError extends Error {
  constructor(
    message: string,
    public readonly aiGenerationId: string | null,
  ) {
    super(message);
    this.name = "MissionGenerationError";
  }
}

type CoreInput = {
  userId: string;
  topic: TopicId;
  level: Level;
};

export async function getOrGenerateMission(
  input: CoreInput,
): Promise<MissionResult> {
  // ---- 1. Cache lookup ----------------------------------------------------
  // Filter on parsedOptions presence rather than `error: null` because
  // post-Step-11b, `error` may also hold cold-storage audit failures —
  // those don't affect mission validity, so we'd otherwise refuse to
  // serve a perfectly good cache hit.
  const cached = await prisma.aiGeneration.findFirst({
    where: {
      userId: input.userId,
      topic: input.topic,
      level: input.level,
      status: "active",
      parsedOptions: { not: Prisma.AnyNull },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, parsedOptions: true },
  });

  if (cached?.parsedOptions) {
    const parsed = MissionOptionsArray.safeParse(cached.parsedOptions);
    if (parsed.success) {
      return { aiGenerationId: cached.id, options: parsed.data, fromCache: true };
    }
    // Stored options no longer match our schema — fall through and regenerate.
  }

  return generateAndPersist(input, { isRegeneration: false });
}

/**
 * Always-fresh generation. Used by POST /api/mission/regenerate after it
 * marks the prior AiGeneration row as 'regenerated' and the active
 * MissionChoice as 'abandoned'. The "vary the angles" hint nudges Claude
 * away from repeating the previous set.
 */
export async function regenerateMissions(
  input: CoreInput,
): Promise<MissionResult> {
  return generateAndPersist(input, { isRegeneration: true });
}

async function generateAndPersist(
  input: CoreInput,
  opts: { isRegeneration: boolean },
): Promise<MissionResult> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      city: true,
      interests: true,
      preferredDuration: true,
    },
  });
  if (!user) {
    throw new MissionGenerationError("User not found", null);
  }

  const cell = matrixCellText(input.topic, input.level);
  const label = levelLabel(input.level);
  const preferenceSummary = await getCachedPreferenceSummary(input.userId);
  const city = (user.city ?? "").trim();

  const preferredDuration =
    user.preferredDuration === "short" ||
    user.preferredDuration === "medium" ||
    user.preferredDuration === "long"
      ? (user.preferredDuration as Duration)
      : null;

  let prompt = buildMissionPrompt({
    topic: input.topic,
    level: input.level,
    city,
    matrixCellText: cell,
    missionTypeLabel: label,
    interests: user.interests,
    preferredDuration,
    preferenceSummary,
  });
  if (opts.isRegeneration) {
    prompt +=
      "\n\nThis is a regeneration — vary the angles from a previous response.";
  }

  const startedAt = new Date();
  const t0 = Date.now();

  let rawText = "";
  let rawResponse: Prisma.InputJsonValue | undefined;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let callError: string | null = null;

  try {
    const response = await anthropic.messages.create({
      model: MISSION_MODEL,
      max_tokens: MISSION_MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });
    rawResponse = response as unknown as Prisma.InputJsonValue;
    inputTokens = response.usage?.input_tokens ?? null;
    outputTokens = response.usage?.output_tokens ?? null;
    for (const block of response.content) {
      if (block.type === "text") rawText += block.text;
    }
  } catch (err) {
    callError =
      err instanceof Error
        ? `${err.name}: ${err.message}`
        : "Unknown Claude error";
  }

  let parsedOptions: MissionOption[] | null = null;
  if (!callError) {
    try {
      parsedOptions = parseClaudeJsonArray(rawText);
    } catch (err) {
      callError = err instanceof Error ? err.message : "Parse error";
    }
  }

  const completedAt = new Date();
  const latencyMs = Date.now() - t0;

  // AI prompt + raw response are persisted inline in the DB. Step 11b
  // originally offloaded these to Cloudinary as `raw` blobs, but we
  // dropped that path along with Cloudinary (rows stay small enough in
  // practice). The schema still carries `promptSentUrl` /
  // `rawResponseUrl` columns for backward compatibility; they stay null
  // on new rows. If AI log volume ever becomes a real Postgres concern,
  // re-introduce cold storage against Supabase Storage instead.
  const rowId = randomUUID();
  const promptSentForRow: string | null = prompt;
  const promptSentUrl: string | null = null;
  const rawResponseForRow: Prisma.InputJsonValue | undefined = rawResponse;
  const rawResponseUrl: string | null = null;

  // null when Claude succeeded and parsing was clean; otherwise the
  // captured error string.
  const recordedError: string | null = callError;

  const row = await prisma.aiGeneration.create({
    data: {
      id: rowId,
      userId: input.userId,
      topic: input.topic,
      level: input.level,
      missionTypeLabel: label,
      matrixCellText: cell,
      city,
      promptSent: promptSentForRow,
      promptSentUrl,
      promptVersion: MISSION_PROMPT_VERSION,
      preferenceSummarySent: preferenceSummary,
      model: MISSION_MODEL,
      rawResponse: rawResponseForRow,
      rawResponseUrl,
      parsedOptions: parsedOptions
        ? (parsedOptions as unknown as Prisma.InputJsonValue)
        : undefined,
      optionsCount: parsedOptions?.length ?? MISSION_OPTIONS_COUNT,
      inputTokens,
      outputTokens,
      latencyMs,
      error: recordedError,
      status: "active",
      startedAt,
      completedAt,
    },
    select: { id: true },
  });

  // Throw ONLY on Claude/parse failure — cold-storage issues are audit
  // bugs, not product failures.
  if (callError || !parsedOptions) {
    throw new MissionGenerationError(
      callError ?? "Claude returned an unusable response",
      row.id,
    );
  }

  return { aiGenerationId: row.id, options: parsedOptions, fromCache: false };
}

// ---------------------------------------------------------------------------
// Claude → JSON helpers
// ---------------------------------------------------------------------------

/**
 * Strip the JSON array out of Claude's text response and validate it has
 * the exact shape we asked for. The prompt forbids markdown fences, but
 * defensive code is cheap: we look for the first `[` and the matching
 * outer `]`, then JSON.parse the slice.
 */
function parseClaudeJsonArray(text: string): MissionOption[] {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Empty response from Claude");

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start < 0 || end <= start) {
    throw new Error("Could not find JSON array in Claude response");
  }
  const slice = trimmed.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "JSON parse failed";
    throw new Error(`Invalid JSON: ${msg}`);
  }

  const result = MissionOptionsArray.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Schema mismatch: ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return result.data;
}
