// Step 11b verification: prove that when cold-storage IS enabled but
// the Cloudinary upload fails (e.g. invalid creds), we degrade
// gracefully — the AiGeneration row is still written, `parsedOptions`
// is still populated, and the failure is recorded in `error`.
//
// Run with a fake-looking CLOUDINARY_URL that satisfies the URL shape
// check but rejects on upload:
//   CLOUDINARY_URL=cloudinary://fake:fake@fake-cloud npx tsx scripts/test-cold-storage.mjs
//
// This script doesn't talk to the dev server — it calls generateAndPersist
// directly so we can swap env in-process without restarting Next.js.

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });

// Sanity: force a clearly-invalid Cloudinary URL so the *.upload() RPC
// will throw, exercising the fallback path. If this is missing or set
// to a placeholder, isCloudStorageEnabled() returns false and the test
// is meaningless — exit early.
if (
  !process.env.CLOUDINARY_URL ||
  !process.env.CLOUDINARY_URL.startsWith("cloudinary://") ||
  process.env.CLOUDINARY_URL.includes("placeholder")
) {
  process.env.CLOUDINARY_URL =
    "cloudinary://fake-key:fake-secret@fake-cloud-name";
}

const { regenerateMissions } = await import("../lib/missions.ts");
const { prisma } = await import("../lib/prisma.ts");

const userRow = await prisma.user.findFirst({
  where: { email: "test@example.com" },
  select: { id: true },
});
if (!userRow) {
  console.error("expected test@example.com to exist");
  process.exit(1);
}

console.log("CLOUDINARY_URL active for this run:", process.env.CLOUDINARY_URL);
console.log("Forcing a regenerate to exercise the cold-storage upload path");

const result = await regenerateMissions({
  userId: userRow.id,
  topic: "cooking",
  level: 3,
});
console.log("regenerate returned, gen:", result.aiGenerationId);
console.log("options count:", result.options.length);

const row = await prisma.aiGeneration.findUnique({
  where: { id: result.aiGenerationId },
  select: {
    promptSent: true,
    promptSentUrl: true,
    rawResponse: true,
    rawResponseUrl: true,
    error: true,
    parsedOptions: true,
  },
});

if (!row) {
  console.error("row not found after regenerate?");
  process.exit(1);
}

function shape(field, url) {
  if (url) return "cold (URL)";
  if (field === null || field === undefined) return "MISSING";
  return "inline";
}

console.log("");
console.log("Row inspection:");
console.log("  promptSent storage  :", shape(row.promptSent, row.promptSentUrl));
console.log("  rawResponse storage :", shape(row.rawResponse, row.rawResponseUrl));
console.log("  parsedOptions       :", Array.isArray(row.parsedOptions) ? `${row.parsedOptions.length} options` : "missing");
console.log("  recorded error      :", row.error?.slice(0, 120) ?? "(none)");

const assertions = [
  ["parsedOptions populated (user gets missions)", Array.isArray(row.parsedOptions) && row.parsedOptions.length === 3],
  ["fallback: promptSent inline because upload failed", row.promptSent !== null && row.promptSentUrl === null],
  ["fallback: rawResponse inline because upload failed", row.rawResponse !== null && row.rawResponseUrl === null],
  ["upload failure recorded in error column", typeof row.error === "string" && row.error.includes("cold-storage")],
];

let fails = 0;
for (const [name, cond] of assertions) {
  console.log(cond ? "  ok —" : "  FAIL —", name);
  if (!cond) fails++;
}

await prisma.$disconnect();
if (fails > 0) {
  console.error(`\n${fails} assertion(s) failed`);
  process.exit(1);
}
console.log("\nCOLD STORAGE FALLBACK TEST PASSED ✔");
process.exit(0);
