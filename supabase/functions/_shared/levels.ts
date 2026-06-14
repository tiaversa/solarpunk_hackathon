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

export function isLevel(value: unknown): value is Level {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_LEVEL && value <= MAX_LEVEL;
}

export function levelLabel(level: Level): LevelLabel {
  return LEVELS[level];
}
