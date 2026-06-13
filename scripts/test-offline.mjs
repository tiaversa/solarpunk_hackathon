// End-to-end offline test for /lib/api-client.ts. Boots Dexie against
// fake-indexeddb, flips navigator.onLine to false, runs the offline
// branches of chooseMission, completeMission, updatePreferences and
// regenerateMission, then flips back online and proves OfflineSync
// logic (replayed manually here) flushes the queue against the real
// dev server.
//
// Run: npm run start (in another terminal), then
//   node scripts/test-offline.mjs
//
// Exits 0 on success, non-zero with a diagnostic on failure.

import "fake-indexeddb/auto";

// Polyfill `window`, `navigator`, `fetch` for the api-client.
// Node 20+ exposes navigator as a read-only getter — re-define it.
globalThis.window = globalThis;
const navState = { onLine: true };
Object.defineProperty(globalThis, "navigator", {
  value: navState,
  writable: true,
  configurable: true,
});
const realFetch = globalThis.fetch;

// Persist a NextAuth cookie between requests, the way a browser would.
let cookieJar = "";

async function fetchWithCookies(url, init = {}) {
  // api-client passes relative URLs ("/api/mission?...") — prepend BASE.
  const absUrl =
    typeof url === "string" && url.startsWith("/") ? `${BASE}${url}` : url;
  const headers = { ...(init.headers ?? {}) };
  if (cookieJar) headers.cookie = cookieJar;
  const res = await realFetch(absUrl, {
    ...init,
    headers,
    redirect: "manual",
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) {
    cookieJar = set
      .map((c) => c.split(";")[0])
      .concat(cookieJar ? [cookieJar] : [])
      .join("; ");
  }
  return res;
}
globalThis.fetch = fetchWithCookies;
const BASE = "http://localhost:3000";

// We launch this script with tsx (`npx tsx scripts/test-offline.mjs`)
// so the @/lib/... TS imports resolve through tsconfig paths.
const api = await import("../lib/api-client.ts");
const { db, missionKey } = await import("../lib/db-client.ts");

function assert(cond, msg) {
  if (!cond) {
    console.error("ASSERTION FAILED:", msg);
    process.exit(1);
  }
  console.log("  ok —", msg);
}

console.log("== logging in ==");
const csrfRes = await realFetch(`${BASE}/api/auth/csrf`);
const csrfCookies = csrfRes.headers.getSetCookie?.() ?? [];
cookieJar = csrfCookies.map((c) => c.split(";")[0]).join("; ");
const { csrfToken } = await csrfRes.json();
const loginRes = await fetchWithCookies(
  `${BASE}/api/auth/callback/credentials`,
  {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken,
      email: "test@example.com",
      password: "hunter1234",
    }),
  },
);
assert([200, 302].includes(loginRes.status), `login HTTP ${loginRes.status}`);

console.log("== priming cache (online getMissions) ==");
const before = await api.getMissions("cooking", 1);
assert(before.options.length === 3, "got 3 mission options");
const cached = await db().currentMission.get(missionKey("cooking", 1));
assert(cached !== undefined, "mission was written to Dexie");

console.log("== going OFFLINE ==");
navState.onLine = false;

console.log("-- offline getMissions falls back to Dexie --");
const offlineMissions = await api.getMissions("cooking", 1);
assert(
  offlineMissions.aiGenerationId === before.aiGenerationId,
  `returned cached gen ${offlineMissions.aiGenerationId}`,
);

console.log("-- offline chooseMission queues + optimistic --");
const chosenIdx = 0;
const chooseRes = await api.chooseMission({
  topic: "cooking",
  level: 1,
  aiGenerationId: before.aiGenerationId,
  chosenIndex: chosenIdx,
});
assert(
  chooseRes.missionChoiceId === "local-pending",
  "synthetic missionChoiceId",
);
const cachedAfterChoose = await db().currentMission.get(
  missionKey("cooking", 1),
);
assert(
  cachedAfterChoose?.optimisticChosenIndex === chosenIdx,
  "optimistic chosenIndex written to Dexie",
);

console.log("-- offline completeMission queues + bumps progress --");
const completeRes = await api.completeMission({
  topic: "cooking",
  level: 1,
  aiGenerationId: before.aiGenerationId,
  chosenIndex: chosenIdx,
  note: "offline note",
});
assert(
  completeRes.progress.currentLevel === 2,
  `optimistic progress went to ${completeRes.progress.currentLevel}`,
);
assert(
  completeRes.progress.completedLevels.includes(1),
  "level 1 marked complete optimistically",
);

console.log("-- offline regenerateMission throws cleanly --");
let regenThrew = false;
try {
  await api.regenerateMission("cooking", 1);
} catch (err) {
  regenThrew = err instanceof Error && err.message.includes("internet");
}
assert(regenThrew, "regenerate throws a friendly offline error");

console.log("-- pending queue snapshot --");
const pending = await db().pendingActions.orderBy("id").toArray();
assert(pending.length === 2, `2 pending actions (got ${pending.length})`);
assert(pending[0].type === "choose", "first pending = choose");
assert(pending[1].type === "complete", "second pending = complete");

console.log("== going BACK ONLINE — replaying queue manually ==");
navState.onLine = true;

let flushed = 0;
for (const action of pending) {
  let res;
  if (action.type === "choose") {
    res = await fetchWithCookies(`${BASE}/api/mission/choose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: action.topic,
        level: action.level,
        aiGenerationId: action.aiGenerationId,
        chosenIndex: action.chosenIndex,
      }),
    });
  } else if (action.type === "complete") {
    res = await fetchWithCookies(`${BASE}/api/mission/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: action.topic,
        level: action.level,
        aiGenerationId: action.aiGenerationId,
        chosenIndex: action.chosenMissionIndex,
        note: action.note ?? undefined,
      }),
    });
  }
  assert(res.ok, `flush ${action.type} → ${res.status}`);
  await db().pendingActions.delete(action.id);
  flushed++;
}
assert(flushed === 2, "flushed all 2 actions");

const remaining = await db().pendingActions.count();
assert(remaining === 0, "queue empty after sync");

console.log("\nOFFLINE TEST PASSED ✔");
process.exit(0);
