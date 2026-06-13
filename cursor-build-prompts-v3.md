# Solarpunk Missions — Cursor Build Prompts (v3)

## How to use this doc
Paste prompts in order. `PLAN.md` (Step 0) tracks status — Cursor updates it after each step.

---

## 🌍 Global Context (paste once, or save as `.cursorrules`)

```
You're building "Solarpunk Missions" — Next.js 14 (App Router, TypeScript),
Vercel, Postgres (Railway) via Prisma, NextAuth (JWT), Claude API, Cloudinary.

Key domain facts:
- Levels are integers 1-6, mapped via a LEVELS constant:
  1 Explore, 2 Make, 3 Improve, 4 Experiment, 5 Connect, 6 Teach.
- A MISSION_MATRIX constant maps (topic, level) -> seed text
  ("matrix_cell_text"). mission_type_label = LEVELS[level] name.
- Mission lifecycle: GENERATE (ai_generations) -> CHOOSE (mission_choices,
  status 'active') -> COMPLETE (completions + mission_choices ->
  'completed' + progress.current_level += 1, except at level 6).
- mission_choices.status: 'active' | 'abandoned' | 'completed'.
  ai_generations.status: 'active' | 'regenerated'.

Conventions:
- Backend: /app/api/**, Prisma schema in /prisma/schema.prisma
- Frontend: /app/(routes)/**, shared components in /components/
- All API responses follow /docs/API_CONTRACTS.md — update it if a shape
  changes. All API shapes use camelCase keys (Prisma default).
- Frontend never calls fetch() directly — always via /lib/api-client.ts
  (one function per endpoint). This is what makes offline support a
  drop-in change later.
- Prisma client singleton in /lib/prisma.ts (globalThis pattern).
- After each step, update /docs/PLAN.md: tick checkboxes, note blockers.
```

---

## Step 0 — Project Plan & Tracking Docs

```
Create /docs/PLAN.md and /docs/API_CONTRACTS.md.

PLAN.md:
- 2-3 sentence overview (mission-based learning app, 6 levels per topic,
  3 AI-generated personalized missions per level, choose-then-complete
  lifecycle).
- Status legend: ⬜ Not started · 🔄 In progress · ✅ Done · ⚠️ Blocked
- Checklist of build steps (all ⬜):
  1. Skeleton, deploy, DB extensions
  2. Auth + Users table
  3. Mission matrix/levels constants + topic selection + progress table
  4. Claude integration (GET /api/mission)
  5. Mission choice (POST /api/mission/choose)  -- MVP loop part 1
  6. Completion + unlock (POST /api/mission/complete) -- MVP COMPLETE
  7. Connection pooling (Prisma Accelerate)
  8. Pre-cached generation
  9. Regenerate, topic reset, preferences endpoints
  10. Offline-first (PWA + IndexedDB + sync)
  11. Polish / stretch (preference summary cache, AI log cold storage,
      dashboard/history)
- "Scalability checklist": Prisma singleton, connection pooling,
  pre-cached generation, preference summary caching, geocode caching,
  AI log cold-storage split.
- "Offline-first checklist": next-pwa, api-client abstraction, IndexedDB
  schema, pending-actions queue (choose/complete/regenerate), sync on
  reconnect.

API_CONTRACTS.md — define these shapes (all keys camelCase):
- GET /api/session -> { user: { id, email, city, interests, preferredDuration } }
- GET /api/progress -> [{ topic, currentLevel, completedLevels }]
- POST /api/progress { topic } -> { topic, currentLevel: 1, completedLevels: [] }
- GET /api/mission?topic=X&level=N ->
    { aiGenerationId, options: [{ title, brief, tip, duration }] (x3) }
- POST /api/mission/choose { topic, level, aiGenerationId, chosenIndex }
    -> { missionChoiceId, status }
- POST /api/mission/complete
    { topic, level, aiGenerationId, chosenIndex, note?, photoBase64? }
    -> { progress: { topic, currentLevel, completedLevels } }
- POST /api/mission/regenerate { topic, level } -> { aiGenerationId, options }
- POST /api/topic/reset { topic } -> { progress }
- PATCH /api/user/preferences { interests?, preferredDuration? } -> { user }
```

---

## Step 1 — Skeleton, Deploy, DB Extensions

```
Set up Next.js 14 (App Router, TS) + Tailwind + Prisma. Create the Prisma
client singleton in /lib/prisma.ts (globalThis pattern). Connect to
Railway Postgres via DATABASE_URL. Add .env.example with DATABASE_URL,
NEXTAUTH_SECRET, NEXTAUTH_URL, ANTHROPIC_API_KEY, CLOUDINARY_URL.

In a Prisma migration (or raw SQL run once), enable the moddatetime
extension:
  CREATE EXTENSION IF NOT EXISTS moddatetime;
(Don't create triggers yet — tables don't exist until later steps.)

Confirm the project builds and is ready for Vercel.

Update /docs/PLAN.md: mark Step 1 done.
```

**Test:** deployed URL loads a blank page; `npx prisma db push` succeeds; extension shows up via `SELECT * FROM pg_extension`.

---

## Step 2 — Auth + Users Table

```
Add NextAuth.js (JWT sessions). Add to Prisma schema:

model User {
  id                String   @id @default(uuid())
  email             String   @unique
  city              String?
  // latitude and longitude are reserved for future GPS support;
  // current implementation uses server-side IP geolocation (Step 3).
  latitude          Float?
  longitude         Float?
  interests         String[] @default([])
  preferredDuration String?  // 'short' | 'medium' | 'long'
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  // Back-relations (populated by later steps)
  aiGenerations          AiGeneration[]
  missionChoices         MissionChoice[]
  completions            Completion[]
  progress               Progress[]
  preferenceSummary      UserPreferenceSummary?
}

After migration, add the moddatetime trigger for users.
IMPORTANT: Prisma maps camelCase fields to quoted camelCase columns in
Postgres, so the trigger argument must use the quoted camelCase name:

  CREATE TRIGGER set_updated_at_users
    BEFORE UPDATE ON "User"
    FOR EACH ROW EXECUTE FUNCTION moddatetime("updatedAt");

Create GET /api/session per API_CONTRACTS.md. Add getSession() to
/lib/api-client.ts.

Update /docs/PLAN.md: mark Step 2 done.
```

**Test:** sign up, log in, refresh — session persists; row exists in `User`; updating the row bumps `updatedAt` automatically.

---

## Step 3 — Mission Matrix, Levels, Topic Selection, Progress

```
Create /lib/levels.ts exporting LEVELS, a 1-indexed array/map:
  1: "Explore", 2: "Make", 3: "Improve", 4: "Experiment",
  5: "Connect", 6: "Teach"

Create /lib/missionMatrix.ts exporting MISSION_MATRIX, keyed by topic id
then level number (1-6), each value the seed text below. Also export a
TOPICS array of { id, label, emoji }.

Topic data (id : emoji : label : [level1..level6 seed text]):
- cooking : 🍳 : Cooking :
  ["Visit local market","Cook seasonal recipe","Improve recipe",
   "Compare ingredients","Interview a cook","Share recipe card"]
- fashion : 👗 : Fashion :
  ["Find repair/rental place","Style existing clothes","Repair garment",
   "Compare buy vs rent","Talk to tailor","Repair guide"]
- games : 🎮 : Games :
  ["Analyze mechanics","Prototype game","Redesign rule",
   "Test mechanics","Interview players","Share rule sheet"]
- tech : 💻 : Tech :
  ["Inspect device/tool","Build low-energy tool","Reuse/repair device",
   "Compare tools","Talk to repairer","Make tutorial"]
- music : 🎵 : Music :
  ["Collect sounds","Compose short track","Remix sustainably",
   "Compare sound sources","Talk to musician","Share process"]
- accessibility : ♿ : Accessibility :
  ["Observe route","Design route guide","Suggest improvement",
   "Compare routes","Talk to user/community","Publish access note"]
- gardening : 🌱 : Gardening :
  ["Visit garden","Plant herbs","Improve growing setup",
   "Compare methods","Talk to gardener","Share growing guide"]

Add to Prisma schema:

model Progress {
  id              String   @id @default(uuid())
  userId          String
  topic           String
  currentLevel    Int      @default(1)  // 1-6
  completedLevels Int[]    @default([])
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user User @relation(fields: [userId], references: [id])

  @@unique([userId, topic])
  @@index([userId])
}

Add the moddatetime trigger for Progress (same camelCase quoting pattern
as Step 2 — use "updatedAt", not updated_at):

  CREATE TRIGGER set_updated_at_progress
    BEFORE UPDATE ON "Progress"
    FOR EACH ROW EXECUTE FUNCTION moddatetime("updatedAt");

Location strategy: server-side IP geolocation (e.g. ipapi.co) pre-fills
User.city on first load; user can edit via text input. No GPS required —
User.latitude and User.longitude are reserved for a future enhancement.

Create GET /api/progress and POST /api/progress per API_CONTRACTS.md.
Add getProgress(), createProgress(topic), getCitySuggestion() to
/lib/api-client.ts.

Update /docs/PLAN.md: mark Step 3 done.
```

**Test:** TOPICS renders as a topic grid; picking one creates a `Progress` row with `currentLevel=1`, `completedLevels=[]`; persists on reload. City field pre-filled but editable.

---

## Step 4 — Claude Integration: GET /api/mission

```
Add to Prisma schema:

model AiGeneration {
  id                    String    @id @default(uuid())
  userId                String
  topic                 String
  level                 Int
  missionTypeLabel      String
  matrixCellText        String
  city                  String
  promptSent            String
  promptVersion         String
  preferenceSummarySent String?
  model                 String
  rawResponse           Json?     @db.JsonB
  parsedOptions         Json?     @db.JsonB
  optionsCount          Int       @default(3)
  inputTokens           Int?
  outputTokens          Int?
  latencyMs             Int?
  error                 String?
  status                String    @default("active")  // 'active' | 'regenerated'
  startedAt             DateTime  @default(now())
  completedAt           DateTime?
  createdAt             DateTime  @default(now())

  user          User            @relation(fields: [userId], references: [id])
  missionChoice MissionChoice[]

  // Composite index covers the cache-lookup query in GET /api/mission:
  // WHERE userId, topic, level, status = 'active'
  @@index([userId, topic, level, status])
}

Create /lib/missionPrompt.ts:
- buildPreferenceSummary(userId): query MissionChoice rows with
  status='completed' for this user (table arrives in Step 5 — guard with
  a try/catch or feature-check for now, return null if table/rows don't
  exist yet) and return a short natural-language summary string, or null.
- buildMissionPrompt({ topic, level, city, matrixCellText, missionTypeLabel,
  preferenceSummary }): returns a Claude prompt instructing it to return
  ONLY a JSON array of exactly 3 { title, brief, tip, duration } objects,
  framed around solarpunk values (community, sustainability, hands-on
  learning). Tag the prompt with promptVersion = "v1.0".

Create GET /api/mission?topic=X&level=N:
1. Authenticate.
2. Check AiGeneration for an existing row WHERE userId, topic, level,
   status='active', error IS NULL — if found, return its parsedOptions.
3. Else: look up matrixCellText from MISSION_MATRIX, missionTypeLabel from
   LEVELS, city/interests/preferredDuration from User, preference summary
   via buildPreferenceSummary(). Build prompt, call Claude, parse JSON,
   save full row to AiGeneration (status='active'), return
   { aiGenerationId, options }.

Add getMissions(topic, level) to /lib/api-client.ts.

Update /docs/PLAN.md: mark Step 4 done.
```

**Test:** `/api/mission?topic=cooking&level=1` returns 3 options + `aiGenerationId`; row appears in `AiGeneration` with `status='active'`; calling it again immediately returns the cached row (no new Claude call).

---

## Step 5 — Mission Choice (MVP loop, part 1)

```
Add to Prisma schema:

model MissionChoice {
  id               String   @id @default(uuid())
  userId           String
  topic            String
  level            Int
  aiGenerationId   String
  optionsPresented Json     @db.JsonB
  chosenIndex      Int      // 0-2
  status           String   @default("active")  // active | abandoned | completed
  chosenAt         DateTime @default(now())

  user         User          @relation(fields: [userId], references: [id])
  aiGeneration AiGeneration  @relation(fields: [aiGenerationId], references: [id])

  // Composite index covers the lookup in POST /api/mission/choose and
  // the upsert check: WHERE userId, topic, level, status = 'active'
  @@index([userId, topic, level, status])
}

model UserPreferenceSummary {
  userId     String   @id
  summary    String
  basedOn    Int
  computedAt DateTime @default(now())
}
// Created now (empty) so the triggers below have a target table.
// Actual population of this table is Step 11 (stretch).

Add the following via a raw SQL migration:

-- Partial unique index: enforces at most one active choice per
-- user+topic+level, preventing race-condition double-inserts.
CREATE UNIQUE INDEX unique_active_choice
  ON "MissionChoice" ("userId", topic, level)
  WHERE status = 'active';

-- Trigger function: invalidate the preference summary cache when a
-- new MissionChoice is inserted (covers choose and complete events).
CREATE OR REPLACE FUNCTION invalidate_pref_summary_on_choice()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM "UserPreferenceSummary" WHERE "userId" = NEW."userId";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invalidate_summary_on_choice
  AFTER INSERT ON "MissionChoice"
  FOR EACH ROW EXECUTE FUNCTION invalidate_pref_summary_on_choice();

-- Trigger function: invalidate the preference summary cache when the
-- user's interests or preferredDuration change.
CREATE OR REPLACE FUNCTION invalidate_pref_summary_on_user_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.interests IS DISTINCT FROM NEW.interests
     OR OLD."preferredDuration" IS DISTINCT FROM NEW."preferredDuration" THEN
    DELETE FROM "UserPreferenceSummary" WHERE "userId" = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invalidate_summary_on_user_update
  AFTER UPDATE ON "User"
  FOR EACH ROW EXECUTE FUNCTION invalidate_pref_summary_on_user_update();

Create POST /api/mission/choose per API_CONTRACTS.md:
1. Authenticate, validate { topic, level, aiGenerationId, chosenIndex }.
2. Upsert into MissionChoice:
   - If an active row exists for (userId, topic, level) -> UPDATE chosenIndex.
   - If not -> INSERT with optionsPresented = AiGeneration.parsedOptions,
     status='active'.
   The partial unique index (above) prevents concurrent double-inserts.
3. Return { missionChoiceId, status }.

Add chooseMission(payload) to /lib/api-client.ts.

Update /docs/PLAN.md: mark Step 5 done.
```

**Test:** generate missions, choose option index 1, then choose index 2 — confirm it's an UPDATE (one row, `chosenIndex=2`), not two rows. `UserPreferenceSummary` table exists but stays empty for now.

---

## Step 6 — Completion + Unlock (MVP COMPLETE here)

```
Add to Prisma schema:

model Completion {
  id                 String   @id @default(uuid())
  userId             String
  topic              String
  level              Int
  // aiGenerationId and chosenMissionIndex must either both be present
  // (normal completion) or both be null (edge case). Enforce this in
  // the API layer; a DB check constraint is added via raw SQL below.
  aiGenerationId     String?
  chosenMissionIndex Int?     // 0-2
  photoUrl           String?
  note               String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  user User @relation(fields: [userId], references: [id])
}

Add via raw SQL migration:

-- Enforce that aiGenerationId and chosenMissionIndex are either both
-- present or both null — no half-populated completion rows.
ALTER TABLE "Completion"
  ADD CONSTRAINT completion_generation_index_paired CHECK (
    ("aiGenerationId" IS NULL) = ("chosenMissionIndex" IS NULL)
  );

Add the moddatetime trigger for Completion (same camelCase quoting
pattern as Steps 2 and 3 — use "updatedAt"):

  CREATE TRIGGER set_updated_at_completion
    BEFORE UPDATE ON "Completion"
    FOR EACH ROW EXECUTE FUNCTION moddatetime("updatedAt");

Add a Cloudinary upload helper in /lib/cloudinary.ts: accepts a base64
image string, returns a hosted URL.

Create POST /api/mission/complete per API_CONTRACTS.md.
IMPORTANT: wrap all DB writes in prisma.$transaction([...]) so a crash
between steps cannot leave Progress and MissionChoice in a mismatched
state.

1. Authenticate, validate { topic, level, aiGenerationId, chosenIndex,
   note?, photoBase64? }.
2. If photoBase64 present -> upload via /lib/cloudinary.ts -> photoUrl.
   (Do this before the transaction — Cloudinary is external and can't be
   rolled back.)
3. Open prisma.$transaction:
   a. INSERT into Completion.
   b. UPDATE MissionChoice SET status='completed' WHERE userId, topic,
      level, status='active'.
   c. UPDATE Progress: append `level` to completedLevels; if level < 6,
      currentLevel = level + 1; if level === 6, leave currentLevel at 6
      (out-of-range values would break the LEVELS constant lookup).
4. Return { progress: { topic, currentLevel, completedLevels } }.

Add completeMission(payload) and uploadPhoto(base64) to
/lib/api-client.ts.

Update /docs/PLAN.md: mark Step 6 done AND mark "MVP COMPLETE".
```

**Test:** full loop — pick topic → see 3 missions → choose one → submit photo + note → `Progress.currentLevel` advances, `completedLevels` includes the old level, `MissionChoice.status` is 'completed', next `GET /api/mission` returns a new generation for the new level.

🎯 **Everything below is additive.** No existing contracts change.

---

## Step 7 — Connection Pooling (scalability)

```
Set up Prisma Accelerate (or PgBouncer). Update DATABASE_URL and
/lib/prisma.ts per Accelerate's setup docs. No schema or contract changes.

Update /docs/PLAN.md: mark Step 7 done under "Scalability checklist".
```

**Test:** app still works end-to-end; Accelerate dashboard shows reused connections, not one per request.

---

## Step 8 — Pre-cached Generation (scalability)

```
Modify POST /api/mission/complete: after the transaction completes (step 3),
if level < 6, asynchronously (fire-and-forget, don't block the response)
call the same logic as GET /api/mission for (topic, level+1) using
buildMissionPrompt() — generate and store that AiGeneration row ahead of
time.

GET /api/mission's cache check already returns an existing active, error-free
row first (Step 4) — this step just ensures that row usually exists before
the user navigates there.

No request/response shape changes.

Update /docs/PLAN.md: mark Step 8 done under "Scalability checklist".
```

**Test:** complete a mission → immediately query `AiGeneration` for `topic` + `level+1` → row already exists with `status='active'`, before opening that mission's view.

---

## Step 9 — Regenerate, Topic Reset, Preferences

```
Create POST /api/mission/regenerate per API_CONTRACTS.md:
1. Authenticate, validate { topic, level }.
2. UPDATE AiGeneration SET status='regenerated' WHERE userId, topic, level,
   status='active'.
3. UPDATE MissionChoice SET status='abandoned' WHERE userId, topic, level,
   status='active'.
   NOTE: this is an UPDATE, not an INSERT, so the invalidate_pref_summary_on_choice
   trigger does NOT fire. The preference summary cache may be slightly stale
   until the user makes a new choice (INSERT). This is acceptable — the
   summary is a hint, not ground truth. If tighter consistency is needed,
   add a separate AFTER UPDATE trigger on MissionChoice for the
   abandoned status transition.
4. Call Claude via buildMissionPrompt(), appending: "This is a
   regeneration — vary the angles from a previous response."
5. Insert new AiGeneration row (status='active'). Return
   { aiGenerationId, options }.

Create POST /api/topic/reset per API_CONTRACTS.md:
1. Authenticate, validate { topic }. (Frontend must confirm before calling.)
2. UPDATE MissionChoice SET status='abandoned' WHERE userId, topic,
   status='active'.
3. UPDATE Progress SET currentLevel=1, completedLevels=[] WHERE userId, topic.
4. Do NOT touch Completion rows — history is preserved.
5. Return { progress }.

Create PATCH /api/user/preferences per API_CONTRACTS.md:
1. Authenticate, validate { interests?, preferredDuration? }.
2. UPDATE User SET interests, preferredDuration.
3. The invalidate_pref_summary_on_user_update trigger (Step 5) invalidates
   UserPreferenceSummary automatically — no manual cache logic needed.
4. Return updated user.

Add regenerateMission(topic, level), resetTopic(topic), and
updatePreferences(payload) to /lib/api-client.ts.

Update /docs/PLAN.md: mark Step 9 done.
```

**Test:** regenerate → old `AiGeneration` row becomes `'regenerated'`, old `MissionChoice` becomes `'abandoned'`, new row returned with different options. Reset → progress back to level 1, `completedLevels=[]`, `Completion` rows untouched. Editing preferences updates `User` and (if any rows exist) clears `UserPreferenceSummary`.

---

## Step 10 — Offline-First

```
Add next-pwa for app-shell caching (offline load of static assets +
routes).

Add Dexie (IndexedDB) with tables: progress, currentMission,
pendingActions. pendingActions entries: { id, type: 'choose' | 'complete'
| 'regenerate', payload, createdAt }.

Update /lib/api-client.ts:
- getProgress() / getMissions(): network first, fall back to Dexie cache
  if offline; write successful responses to Dexie.
- chooseMission() / completeMission() / regenerateMission(): if offline,
  write to pendingActions and return an optimistic local response
  (update Dexie's progress/currentMission optimistically too); if online,
  call the real endpoint as normal.

Add a sync handler on the 'online' window event: flush pendingActions in
order (oldest first) to their real endpoints, then clear them from Dexie.
If a 'complete' action references a photo, store the base64 in Dexie
until synced.

No API contract changes — components keep calling the same
api-client functions.

Update /docs/PLAN.md: mark Step 10 done under "Offline-first checklist".
```

**Test:** airplane mode → app loads, shows cached mission → choose an option, then complete it with a photo (both queued locally, UI updates optimistically) → reconnect → both actions sync to the DB in order.

---

## Step 11 — Polish / Stretch

```
Pick based on remaining time:

- Populate UserPreferenceSummary: on GET /api/mission, if a row exists for
  the user use its `summary` directly; if not, compute via
  buildPreferenceSummary(), insert into UserPreferenceSummary, then use it.
  The existing triggers (Step 5) already invalidate it when needed — no
  extra invalidation logic required.

- AI log cold-storage split: move AiGeneration.promptSent and
  rawResponse to Cloudinary as JSON files, store only the URL in the DB
  row. Reduces Postgres row size significantly at scale.

- GET /api/history -> Completion history per topic, for a dashboard.

Update /docs/PLAN.md accordingly.
```

**Test:** each addition returns the documented shape and renders correctly; preference summary is computed once then reused from cache on subsequent calls until invalidated.

---

## Schema change summary (fixes applied in v3)

The following issues from the original document were resolved:

| # | Issue | Fix applied |
|---|-------|-------------|
| 1 | moddatetime trigger used snake_case column name (`updated_at`) but Prisma generates camelCase (`"updatedAt"`) | All three triggers (User, Progress, Completion) now use the quoted camelCase column name |
| 2 | `AiGeneration`, `MissionChoice`, and `Completion` had no `@relation` on `userId` — no referential integrity | `@relation` + back-references added on all three models and on `User` |
| 3 | `MissionChoice.aiGenerationId` had no `@relation` to `AiGeneration` | `@relation` added; `AiGeneration` gains a `missionChoice` back-reference |
| 4 | `rawResponse` and `parsedOptions` / `optionsPresented` used `Json` without `@db.JsonB` | Changed to `@db.JsonB` for Postgres JSONB storage and indexing |
| 5 | No index on the frequent cache-lookup queries | `@@index([userId, topic, level, status])` added to `AiGeneration` and `MissionChoice` |
| 6 | No unique constraint on active MissionChoice — race conditions possible | Partial unique index `WHERE status = 'active'` added via raw SQL |
| 7 | `POST /api/mission/complete` DB writes were not transactional | All three writes now wrapped in `prisma.$transaction()` |
| 8 | `Completion.aiGenerationId` and `chosenMissionIndex` were independently optional with no paired constraint | DB check constraint enforces both present or both null |
| 9 | `latitude`/`longitude` columns existed but were never used or explained | Retained with a clear comment marking them as reserved for future GPS support |
| 10 | API contract used snake_case (`preferred_duration`, `ai_generation_id`) inconsistently with Prisma camelCase output | All contract keys standardised to camelCase throughout |
| 11 | Trigger function names were nearly identical, risking confusion | Renamed to `invalidate_pref_summary_on_choice` and `invalidate_pref_summary_on_user_update` |
| 12 | Regenerate's `abandoned` MissionChoice UPDATE does not fire the INSERT-based cache invalidation trigger | Documented explicitly with a note on acceptable staleness and a path to tighter consistency |
