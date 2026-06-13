import Anthropic from "@anthropic-ai/sdk";

// Singleton so we reuse the keep-alive HTTP connection in dev. Same pattern
// as the Prisma client.
const globalForAnthropic = globalThis as unknown as {
  anthropic: Anthropic | undefined;
};

export const anthropic =
  globalForAnthropic.anthropic ??
  new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  });

if (process.env.NODE_ENV !== "production") {
  globalForAnthropic.anthropic = anthropic;
}

// The chosen default model for /api/mission. Stored verbatim on every
// AiGeneration row, so changing it here only affects new generations.
export const MISSION_MODEL = "claude-sonnet-4-5";
