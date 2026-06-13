/**
 * MISSION_MATRIX — seed text for every (topic, level) cell.
 *
 * The matrix is the deterministic, hand-tuned scaffold under every Claude
 * generation. Each cell text is short and instruction-like; the prompt in
 * Step 4 wraps it with city, interests, preferred duration, and the
 * preference summary to ask for 3 personalised variants.
 *
 * Adding a new topic = add it to TOPICS *and* to MISSION_MATRIX.
 */

import type { Level } from "@/lib/levels";

export type TopicId =
  | "cooking"
  | "fashion"
  | "games"
  | "tech"
  | "music"
  | "accessibility"
  | "gardening";

export type Topic = {
  id: TopicId;
  emoji: string;
  label: string;
};

export const TOPICS: readonly Topic[] = [
  { id: "cooking", emoji: "🍳", label: "Cooking" },
  { id: "fashion", emoji: "👗", label: "Fashion" },
  { id: "games", emoji: "🎮", label: "Games" },
  { id: "tech", emoji: "💻", label: "Tech" },
  { id: "music", emoji: "🎵", label: "Music" },
  { id: "accessibility", emoji: "♿", label: "Accessibility" },
  { id: "gardening", emoji: "🌱", label: "Gardening" },
] as const;

export const TOPIC_IDS: readonly TopicId[] = TOPICS.map((t) => t.id);

export function isTopicId(value: unknown): value is TopicId {
  return typeof value === "string" && (TOPIC_IDS as readonly string[]).includes(value);
}

export function getTopic(id: TopicId): Topic {
  const t = TOPICS.find((topic) => topic.id === id);
  // TopicId is a closed union, so this is unreachable in normal use.
  if (!t) throw new Error(`Unknown topic id: ${id}`);
  return t;
}

// Cell text indexed [level - 1] to match LEVELS (1..6).
type MatrixRow = readonly [string, string, string, string, string, string];

export const MISSION_MATRIX: Readonly<Record<TopicId, MatrixRow>> = {
  cooking: [
    "Visit local market",
    "Cook seasonal recipe",
    "Improve recipe",
    "Compare ingredients",
    "Interview a cook",
    "Share recipe card",
  ],
  fashion: [
    "Find repair/rental place",
    "Style existing clothes",
    "Repair garment",
    "Compare buy vs rent",
    "Talk to tailor",
    "Repair guide",
  ],
  games: [
    "Analyze mechanics",
    "Prototype game",
    "Redesign rule",
    "Test mechanics",
    "Interview players",
    "Share rule sheet",
  ],
  tech: [
    "Inspect device/tool",
    "Build low-energy tool",
    "Reuse/repair device",
    "Compare tools",
    "Talk to repairer",
    "Make tutorial",
  ],
  music: [
    "Collect sounds",
    "Compose short track",
    "Remix sustainably",
    "Compare sound sources",
    "Talk to musician",
    "Share process",
  ],
  accessibility: [
    "Observe route",
    "Design route guide",
    "Suggest improvement",
    "Compare routes",
    "Talk to user/community",
    "Publish access note",
  ],
  gardening: [
    "Visit garden",
    "Plant herbs",
    "Improve growing setup",
    "Compare methods",
    "Talk to gardener",
    "Share growing guide",
  ],
};

export function matrixCellText(topic: TopicId, level: Level): string {
  return MISSION_MATRIX[topic][level - 1];
}
