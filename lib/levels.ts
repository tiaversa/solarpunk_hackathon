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
