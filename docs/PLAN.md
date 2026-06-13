# Solarpunk Missions — Build Plan

Mission-based learning app. Each topic has 6 levels (Explore → Make → Improve →
Experiment → Connect → Teach). Per level we generate 3 personalized missions via
Claude; the user chooses one, then completes it (optional photo + note), which
unlocks the next level. Built on Next.js 14 (App Router, TypeScript), Postgres
via Prisma, NextAuth (JWT), Claude API, Cloudinary.

## Status legend
- ⬜ Not started
- 🔄 In progress
- ✅ Done
- ⚠️ Blocked

## Build steps
1. ✅ Skeleton, deploy, DB extensions
2. ✅ Auth + Users table
3. ✅ Mission matrix/levels constants + topic selection + progress table
4. ✅ Claude integration (GET /api/mission)
5. ✅ Mission choice (POST /api/mission/choose) — MVP loop part 1
6. ✅ Completion + unlock (POST /api/mission/complete) — **MVP COMPLETE** 🎯
7. ✅ Connection pooling (PgBouncer locally; Accelerate URL drop-in for prod)
8. ✅ Pre-cached generation
9. ✅ Regenerate, topic reset, preferences endpoints
10. ✅ Offline-first (PWA + IndexedDB + sync)
11. ✅ Polish / stretch (preference summary cache, AI log cold-storage split, history dashboard)

## Scalability checklist
- ✅ Prisma singleton (`/lib/prisma.ts`, globalThis pattern)
- ✅ Connection pooling (PgBouncer locally; Prisma Accelerate / Railway pgbouncer in prod)
- ✅ Pre-cached generation (next level prepared on completion)
- ✅ Preference summary caching (`UserPreferenceSummary` read-through; Step 5 triggers invalidate on choose / preference update)
- ✅ Geocode caching (city resolved server-side via `/api/geolocation`, stored on `User`)
- ✅ AI log cold-storage split (`lib/cloudStorage.ts` → Cloudinary raw; falls back to inline when `CLOUDINARY_URL` is unset or upload fails — audit-only, never blocks the user)

## Offline-first checklist
- ✅ `next-pwa` app-shell caching (`@ducanh2912/next-pwa`, prod-only SW)
- ✅ `/lib/api-client.ts` abstraction (every fetch goes through it)
- ✅ Dexie IndexedDB schema (`progress`, `currentMission`, `pendingActions`)
- ✅ Pending-actions queue (`choose`, `complete`, `preferences` — `regenerate` rejects with a friendly online-required error)
- ✅ Sync on `online` window event, oldest first (`/components/OfflineSync.tsx`)

## Divergences from the build prompts
Recorded as we go so the spec and implementation stay aligned.

- **Step 2 / `User` model**: added a non-spec `passwordHash` field. The spec calls
  for "NextAuth (JWT)" but doesn't pick a provider; we chose the Credentials
  provider (email + password), which requires storing a hashed password. All
  other fields are exactly as specified. No API contract changes — `passwordHash`
  is never returned to the client.
- **Step 6 / `uploadPhoto(base64)` in api-client**: the spec calls for this
  function but the contract has no standalone upload endpoint — `photoBase64`
  rides inline on `POST /api/mission/complete`. Implemented `uploadPhoto`
  instead as a browser `File` → base64 data-URI adapter so UI code can
  do `const photoBase64 = await uploadPhoto(file)` before calling
  `completeMission()`. The Cloudinary upload happens server-side inside
  the route handler, before the `prisma.$transaction` block.
- **Step 4 / `/topic/[topic]` level pills**: added `prefetch={false}` to
  the Next.js `Link` components. Without it, App Router's speculative
  prefetch eagerly renders adjacent levels on hover / visibility, which
  triggers real Claude generations (each ~$0 in dev but still 8-10s and a
  wasted DB row). Mission generation must only fire on explicit user
  navigation.
- **Step 7 / Connection pooling**: shipped local PgBouncer
  (`edoburu/pgbouncer` in `docker-compose.yml`) instead of Prisma
  Accelerate. The runtime URL has `?pgbouncer=true&connection_limit=1`
  (Prisma disables prepared statements in transaction mode); migrations
  use `DIRECT_URL` to bypass the pooler. Production drops in an Accelerate
  URL with no code changes — `/lib/prisma.ts` is unchanged.
- **Step 9 / Regenerate prompt nudge**: appended a "vary the angles"
  hint to the prompt only when called via `POST /api/mission/regenerate`
  (vs the initial generate path) so cache misses on a fresh user don't
  see the nudge.
- **Step 9 / Reset trigger semantics**: `POST /api/topic/reset` marks
  active `MissionChoice` rows as `abandoned` via an UPDATE. The
  `invalidate_pref_summary_on_choice` trigger only fires on INSERT, so
  the preference summary cache isn't invalidated by a reset. Since the
  summary cache is unused in MVP (Step 11), this is benign; revisit when
  Step 11 lands.
- **Step 10 / Offline-first**: chose `@ducanh2912/next-pwa` (maintained
  fork of `next-pwa` that supports App Router) and Dexie 4. The SW is
  disabled in `next dev` so a stale precache doesn't fight with HMR.
  `regenerateMission()` rejects when offline instead of queueing — three
  novel missions can't be synthesised client-side without Claude.
- **Step 11b / Cold-storage cache filter**: the `getOrGenerateMission`
  cache lookup used to filter `WHERE error IS NULL`. After Step 11b the
  `error` column may also hold cold-storage upload failures (which don't
  affect mission validity), so the filter was changed to
  `parsedOptions IS NOT NULL` via `Prisma.AnyNull`. Same intent ("valid
  cached result"), more precise predicate.
- **Step 11b / Cold-storage failure handling**: cold-storage upload
  errors are tracked in a separate `coldStorageError` variable and only
  joined into the row's `error` field for audit. They never trigger
  `MissionGenerationError` — the user's missions are returned as long
  as Claude itself succeeded. The Cloudinary upload is also synchronous
  (in front of the row INSERT) rather than fire-and-forget, so the URL
  is correct on the very first write.
- **Step 11c / History page join**: `Completion.aiGenerationId` is a
  bare FK column without an `@relation`. Rather than migrate the schema
  mid-step, the history page and `GET /api/history` do a second
  `findMany({ where: { id: { in: genIds } } })` to materialise mission
  titles from `parsedOptions`. Cost: one extra Prisma round trip per
  request. If history becomes hot, add the relation and drop the second
  query.

## Blockers
None yet.
