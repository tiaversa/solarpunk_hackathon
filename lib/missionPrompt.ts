/**
 * missionPrompt — everything we send to Claude for one (topic, level) call.
 *
 * Exports:
 *
 *  - buildPreferenceSummary(userId): looks at the user's COMPLETED mission
 *    choices and returns `{ summary, basedOn }`. `summary` is null if the
 *    user has no history (or if the `MissionChoice` table doesn't exist
 *    yet — pre-Step 5 backwards compat). `basedOn` is the row count.
 *
 *  - getCachedPreferenceSummary(userId): wraps the above with a
 *    UserPreferenceSummary read-through cache (Step 11). Existing
 *    invalidation triggers (Step 5) clear the row when a new MissionChoice
 *    is inserted or the user's interests/preferredDuration change.
 *
 *  - buildMissionPrompt({...}): returns the full prompt string Claude sees.
 *    Versioned via `MISSION_PROMPT_VERSION` so we can diff prompts over
 *    time (stored on every `AiGeneration` row as `promptVersion`).
 */

import { prisma } from "@/lib/prisma";
import type { TopicId } from "@/lib/missionMatrix";
import { getTopic } from "@/lib/missionMatrix";
import type { Level, LevelLabel } from "@/lib/levels";

export const MISSION_PROMPT_VERSION = "v1.0";

export type Duration = "short" | "medium" | "long";

// ---------------------------------------------------------------------------
// Preference summary
// ---------------------------------------------------------------------------

type CompletedChoiceRow = {
  topic: string;
  chosenIndex: number;
  optionsPresented: unknown;
};

/**
 * Build a one-sentence summary of what kinds of missions this user has
 * historically completed. Used to gently bias future generations.
 *
 * Implementation note (per Step 4 of the spec): the `MissionChoice` table
 * doesn't exist until Step 5. We try the query with `$queryRawUnsafe` and
 * swallow "relation does not exist" errors, returning null. Once Step 5
 * adds the table this function starts returning real summaries with no
 * code changes here.
 */
export type PreferenceSummaryResult = {
  summary: string | null;
  basedOn: number;
};

export async function buildPreferenceSummary(
  userId: string,
): Promise<PreferenceSummaryResult> {
  let rows: CompletedChoiceRow[];
  try {
    rows = await prisma.$queryRaw<CompletedChoiceRow[]>`
      SELECT topic, "chosenIndex", "optionsPresented"
      FROM "MissionChoice"
      WHERE "userId" = ${userId} AND status = 'completed'
      ORDER BY "chosenAt" DESC
      LIMIT 50
    `;
  } catch {
    // Relation doesn't exist yet (Step 5) or any other lookup failure.
    return { summary: null, basedOn: 0 };
  }

  if (rows.length === 0) return { summary: null, basedOn: 0 };

  // Count topic frequency and pull chosen titles + durations.
  const topicCounts = new Map<string, number>();
  const chosenTitles: string[] = [];
  const durationCounts = new Map<Duration, number>();

  for (const row of rows) {
    topicCounts.set(row.topic, (topicCounts.get(row.topic) ?? 0) + 1);
    const opts = Array.isArray(row.optionsPresented)
      ? row.optionsPresented
      : [];
    const chosen = opts[row.chosenIndex];
    if (chosen && typeof chosen === "object") {
      const o = chosen as { title?: unknown; duration?: unknown };
      if (typeof o.title === "string") chosenTitles.push(o.title);
      if (
        o.duration === "short" ||
        o.duration === "medium" ||
        o.duration === "long"
      ) {
        durationCounts.set(
          o.duration,
          (durationCounts.get(o.duration) ?? 0) + 1,
        );
      }
    }
  }

  const topTopics = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);
  const topDuration = [...durationCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0];
  const recent = chosenTitles.slice(0, 3);

  const parts: string[] = [];
  parts.push(`${rows.length} mission(s) completed so far`);
  if (topTopics.length > 0) {
    parts.push(`favourite topics: ${topTopics.join(", ")}`);
  }
  if (topDuration) {
    parts.push(`tends to pick ${topDuration} missions`);
  }
  if (recent.length > 0) {
    parts.push(`recent picks: "${recent.join('", "')}"`);
  }
  return {
    summary: parts.join("; ") + ".",
    basedOn: rows.length,
  };
}

/**
 * Read-through cache for buildPreferenceSummary. Step 11a — the heavy
 * raw SQL aggregation runs at most once per (user, cache invalidation
 * cycle). Invalidation is handled by the Step 5 DB triggers:
 *
 *   - INSERT into MissionChoice  → DELETE the cached row
 *   - UPDATE User.interests or User.preferredDuration → DELETE the cached row
 *
 * If the summary computes to null (user has no completed history yet)
 * we deliberately DO NOT cache — the very next MissionChoice INSERT
 * would invalidate it anyway, and we want a fresh compute then.
 */
export async function getCachedPreferenceSummary(
  userId: string,
): Promise<string | null> {
  const cached = await prisma.userPreferenceSummary.findUnique({
    where: { userId },
    select: { summary: true },
  });
  if (cached) return cached.summary;

  const computed = await buildPreferenceSummary(userId);
  if (computed.summary === null) return null;

  // upsert (not create) because a concurrent generation may have raced
  // us to the insert; in that case we just overwrite with our value.
  await prisma.userPreferenceSummary.upsert({
    where: { userId },
    create: {
      userId,
      summary: computed.summary,
      basedOn: computed.basedOn,
    },
    update: {
      summary: computed.summary,
      basedOn: computed.basedOn,
      computedAt: new Date(),
    },
  });

  return computed.summary;
}

// ---------------------------------------------------------------------------
// Mission prompt
// ---------------------------------------------------------------------------

export type NearbyOpportunity = {
  orgName: string;
  title: string;
  description: string;
  distanceKm: number;
};

export type BuildMissionPromptInput = {
  topic: TopicId;
  level: Level;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
  matrixCellText: string;
  missionTypeLabel: LevelLabel;
  interests: string[];
  preferredDuration: Duration | null;
  preferenceSummary: string | null;
  nearbyOpportunities?: NearbyOpportunity[];
};

export function buildMissionPrompt(input: BuildMissionPromptInput): string {
  const topicMeta = getTopic(input.topic);
  const interestsLine =
    input.interests.length > 0
      ? input.interests.map((s) => `"${s}"`).join(", ")
      : "(none yet)";
  const durationLine = input.preferredDuration
    ? `Prefers ${input.preferredDuration}-length missions when possible.`
    : `No strong duration preference yet — vary across short / medium / long.`;
  const summaryLine = input.preferenceSummary
    ? `Past behaviour: ${input.preferenceSummary}`
    : `No completed missions yet — this is a fresh learner.`;

  const locationLine =
    input.latitude != null && input.longitude != null
      ? `Learner is in ${input.city || "their local area"} (GPS: ${input.latitude.toFixed(4)}, ${input.longitude.toFixed(4)} — prioritise places within a few km of these coordinates).`
      : `Learner is in ${input.city || "their local area"}.`;

  const opportunitiesBlock =
    input.nearbyOpportunities && input.nearbyOpportunities.length > 0
      ? [
          ``,
          `Nearby community opportunities — real open requests from local organisations within ${Math.round(input.nearbyOpportunities[input.nearbyOpportunities.length - 1]!.distanceKm)} km:`,
          ...input.nearbyOpportunities.map(
            (o, i) =>
              `  ${i + 1}. ${o.orgName}: "${o.title}" — ${o.description} (${o.distanceKm.toFixed(1)} km away)`,
          ),
          `For at least one of the 3 mission options, design it so the learner could directly help fulfil one of these requests. Make the connection explicit in the "brief" field.`,
        ]
      : [];

  return [
    `You are designing real-world learning missions for the Solarpunk Missions app.`,
    `Solarpunk values: community, sustainability, hands-on learning, repair-over-replace, joyful curiosity, low-energy living, lived experience over consumption.`,
    ``,
    `Topic: ${topicMeta.label} ${topicMeta.emoji} (id: ${input.topic})`,
    `Level ${input.level} of 6 — "${input.missionTypeLabel}". Seed brief from the mission matrix: "${input.matrixCellText}".`,
    locationLine,
    `Stated interests: ${interestsLine}.`,
    durationLine,
    summaryLine,
    ...opportunitiesBlock,
    ``,
    `Generate exactly 3 mission options, each different from the others in approach or angle.`,
    `Each option must be doable in one day with no specialised equipment, grounded in the learner's city, and respectful of the "${input.missionTypeLabel}" level.`,
    ``,
    `Output rules — read carefully:`,
    `- Return ONLY a raw JSON array. No prose, no markdown fences, no commentary.`,
    `- Exactly 3 items.`,
    `- Each item has exactly these keys, in this order:`,
    `    "title"    (string, <= 60 chars, action-first, no emoji)`,
    `    "brief"    (string, 1-2 sentences, plain language, mentions the city or a local landmark when natural)`,
    `    "tip"      (string, 1 sentence, a concrete how-to or what-to-watch-for nudge)`,
    `    "duration" (string, one of: "short" (under 30 min), "medium" (30-90 min), "long" (half-day or more))`,
    `- Use only ASCII-friendly quotes inside strings (escape with \\" when needed).`,
    `- No trailing commas. Strict JSON parseable by JSON.parse.`,
  ].join("\n");
}
