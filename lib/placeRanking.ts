/**
 * placeRanking — pick the most relevant cached city places for a
 * specific chosen mission.
 *
 * Why this exists:
 *   CityResources is cached at the (city, topic) grain. That means all
 *   3 missions generated for a given (topic, level) share the SAME set
 *   of nearby places — which is wrong for a user who expects "talk to
 *   a tailor" and "visit a marketplace" missions to surface different
 *   on-the-ground support.
 *
 * What this does:
 *   Right after a MissionChoice is recorded, we ask Claude to look at
 *   the chosen mission's title/brief/tip and the (up to 10) cached
 *   places, and return an ordered list of indices for the N most
 *   relevant. The picked subset is persisted on MissionChoice and
 *   shown under the chosen card.
 *
 * Failure semantics:
 *   Any failure (Claude error, invalid JSON, out-of-range indices,
 *   abort) returns null. Callers fall back to the unranked top-N from
 *   CityResources. Ranking is a quality improvement, not a correctness
 *   requirement, so failures must never break the choose action.
 */

import { anthropic, MISSION_MODEL } from "@/lib/anthropic";
import type { CityResourcePlace } from "@/lib/cityResources";
import type { MissionOption } from "@/lib/missions";

// Output is a short JSON array of integers (e.g. `[3,7,1,4,2]`).
// 100 tokens is plenty even with whitespace and Claude's occasional
// preamble that we strip in parseIndices.
const RANKING_MAX_TOKENS = 100;

// How many places to keep after ranking. Matches MAX_PLACES_TO_SHOW in
// MissionList.tsx but the two are intentionally separate constants:
// this controls what we *persist*, MAX_PLACES_TO_SHOW controls what we
// *render*. Keeping them in sync avoids storing data the UI ignores.
export const RANKING_RESULT_COUNT = 5;

export async function rankPlacesForMission(
  mission: MissionOption,
  places: readonly CityResourcePlace[],
  signal?: AbortSignal,
): Promise<CityResourcePlace[] | null> {
  // No places → nothing to rank. Up-front bail also covers the cold-
  // cache-empty-result path so we don't make a Claude call for an
  // empty list.
  if (places.length === 0) return null;
  // Fewer places than we'd return anyway — skip the call. Returning
  // them in their existing order is a safe default since CityResources
  // already orders by OSM tag-query priority (declared in
  // TOPIC_OSM_QUERIES).
  if (places.length <= RANKING_RESULT_COUNT) return places.slice();

  const prompt = buildRankingPrompt(mission, places, RANKING_RESULT_COUNT);

  let rawText = "";
  try {
    const response = await anthropic.messages.create(
      {
        model: MISSION_MODEL,
        max_tokens: RANKING_MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      },
      // Anthropic SDK accepts a per-request signal in the second arg.
      // We forward the choose-endpoint's overall budget through here so
      // ranking shares the same kill-switch as the OSM lookup.
      signal ? { signal } : undefined,
    );
    for (const block of response.content) {
      if (block.type === "text") rawText += block.text;
    }
  } catch {
    return null;
  }

  const indices = parseIndices(rawText, places.length);
  if (indices === null) return null;

  const picked = indices
    .slice(0, RANKING_RESULT_COUNT)
    .map((i) => places[i])
    .filter((p): p is CityResourcePlace => p !== undefined);

  // Treat an empty pick as a failure — the prompt asks for non-empty
  // output, and an empty array probably means Claude returned `[]`
  // because it misread the instructions. Falling back to the unranked
  // top-N is more useful than showing nothing.
  if (picked.length === 0) return null;
  return picked;
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

function buildRankingPrompt(
  mission: MissionOption,
  places: readonly CityResourcePlace[],
  count: number,
): string {
  const placeLines = places.map((p, i) => {
    const addr = p.address ? ` — ${p.address}` : "";
    return `  ${i}. ${p.category}: ${p.name}${addr}`;
  });

  return [
    `You are picking the most useful local places to support a specific Green Quest learner who just chose this mission. Green Quest is a real-world Solarpunk learning app, so prefer places that fit the mission's hands-on, community-rooted intent.`,
    ``,
    `The mission they picked:`,
    `- Title: ${mission.title}`,
    `- Brief: ${mission.brief}`,
    `- Tip: ${mission.tip}`,
    ``,
    `Their city's tagged Solarpunk-aligned places (numbered, with OSM category before the colon):`,
    ...placeLines,
    ``,
    `Pick the ${count} places most directly useful for this mission. Optimise for the mission's action — if the mission says "talk to a tailor", prefer Tailor places; if it says "visit a marketplace", prefer Marketplace places; if it says "repair", prefer Repair café / Tailor / Cobbler. When several places fit equally well, prefer variety in category over duplicating one type.`,
    ``,
    `Output rules:`,
    `- Return ONLY a raw JSON array of the chosen 0-based indices, ordered most-relevant first.`,
    `- Exactly ${count} indices. No fewer, no more.`,
    `- Each index must appear in the numbered list above.`,
    `- No prose, no markdown fences. Example: [3,7,1,4,2]`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Output parsing
// ---------------------------------------------------------------------------

/**
 * Pull a JSON array of integer indices out of Claude's text response.
 * Defensive against:
 *   - leading/trailing prose despite the prompt forbidding it
 *   - markdown fences
 *   - duplicate indices (dedup, keep first)
 *   - out-of-range indices (drop)
 *   - non-integer values (drop)
 *
 * Returns null only if the slice doesn't contain a parseable JSON
 * array at all — empty arrays return [] and the caller decides.
 */
function parseIndices(text: string, max: number): number[] | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start < 0 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const seen = new Set<number>();
  const result: number[] = [];
  for (const v of parsed) {
    if (typeof v !== "number" || !Number.isInteger(v)) continue;
    if (v < 0 || v >= max) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    result.push(v);
  }
  return result;
}
