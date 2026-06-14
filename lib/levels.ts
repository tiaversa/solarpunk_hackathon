/**
 * The six progression levels every topic shares.
 *
 * Levels are 1-indexed integers and stored as integers on the Progress row.
 * The label is what we render in UI and what we send to Claude as
 * `missionTypeLabel` in Step 4's prompt.
 */

export const LEVELS = {
  1: "Explore",
  2: "Make",
  3: "Improve",
  4: "Experiment",
  5: "Connect",
  6: "Teach",
} as const;

export type Level = keyof typeof LEVELS;
export type LevelLabel = (typeof LEVELS)[Level];

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 6;

export const LEVEL_NUMBERS: readonly Level[] = [1, 2, 3, 4, 5, 6] as const;

export function isLevel(value: unknown): value is Level {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_LEVEL &&
    value <= MAX_LEVEL
  );
}

export function levelLabel(level: Level): LevelLabel {
  return LEVELS[level];
}

/**
 * Per-level guidance. The progression is intentional: each level moves
 * the learner from observing → doing → refining → varying → contributing
 * → transmitting, with sustainability already woven into the first step.
 *
 * Each entry carries three things so Claude (and any future UI surface)
 * has both a definition and the anti-patterns:
 *   - oneLiner : what this level is about
 *   - looksLike: concrete shapes a mission at this level can take
 *   - notYet   : shapes that belong to a different level (most common
 *                failure mode: a Level 2 mission that sneaks in Level 4
 *                comparison, or a Level 5 mission that's really Level 6
 *                teaching material)
 */
export type LevelDescription = {
  oneLiner: string;
  looksLike: string;
  notYet: string;
};

export const LEVEL_DESCRIPTIONS: Readonly<Record<Level, LevelDescription>> = {
  1: {
    oneLiner:
      "Get to know the topic with a sustainability lens already in place. Observational, low-effort, no prior experience or special tools required.",
    looksLike:
      "Visiting a local market, repair shop, garden, or workshop; noticing where things come from and how they're made; asking one practitioner a single question; reading labels and origins.",
    notYet:
      "Producing, making, repairing, comparing across methods, or creating anything for others. The learner is here to look and ask, not to do.",
  },
  2: {
    oneLiner:
      "Put your feet in the water — try the activity end-to-end yourself for the first time, even roughly.",
    looksLike:
      "A first solo attempt: cook one seasonal meal, plant one herb, hand-stitch one repair, record one short field track, sketch one rule for a small game.",
    notYet:
      "Comparing methods, iterating on a previous attempt, or producing teaching material. Rough and complete beats polished and partial.",
  },
  3: {
    oneLiner:
      "Get a little better at the skill AND make it a little more sustainable. Improvement and sustainability are paired, not optional.",
    looksLike:
      "Take a previous attempt and redo it with one explicit sustainable change — lower-energy method, reused or local materials, less waste, longer lifespan, or a smaller footprint.",
    notYet:
      "Starting from scratch, running side-by-side experiments, or producing anything for others. The sustainability change must be named and concrete.",
  },
  4: {
    oneLiner:
      "You're comfortable now — try substitutions, comparisons, and new ideas to learn how variables behave.",
    looksLike:
      "Swap one variable (ingredient, tool, technique, sound source, route); run A vs B on the same task; log what changed and why one was better.",
    notYet:
      "Just refining a single approach (that's Improve) or doing something for someone else (that's Connect). The point is deliberate variation and comparison.",
  },
  5: {
    oneLiner:
      "Use the skill to directly support someone else. This is the differential of the Solarpunk path — moving from solo practice to community contribution.",
    looksLike:
      "Cook for or with a neighbour; repair a friend's item; host a small swap; join or run a local skill-share; offer a free session; help one person with something the learner can now do.",
    notYet:
      "Writing a guide (that's Teach) or just chatting about the topic. The support must be a concrete interaction where another person benefits.",
  },
  6: {
    oneLiner:
      "Pass the skill on — either by codifying it so others can use it without you, or by actively mentoring someone through it.",
    looksLike:
      "Hands-off: a recipe card, a short written or video guide, a one-page zine, a published access note. Active: a small workshop, a one-on-one mentoring session, a walk-through where the learner explains as they go.",
    notYet:
      "A solo activity with no audience, or vague personal reflection that isn't usable by anyone else. Either produce a durable artefact OR run a real mentoring interaction.",
  },
};

export function levelDescription(level: Level): LevelDescription {
  return LEVEL_DESCRIPTIONS[level];
}
