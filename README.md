# Solarpunk Missions

A gamified community action app. Pick a topic (food, energy, mobility…), climb 6 levels of hands-on missions — Explore → Make → Improve → Experiment → Connect → Teach — each one AI-generated and grounded in your city and interests.

## Stack

- **Frontend** — Next.js 14 App Router (TypeScript)
- **Backend** — Supabase Edge Functions (Deno runtime)
- **Database** — PostgreSQL via Supabase
- **Auth** — Supabase Auth (email + password)
- **AI** — Anthropic Claude (mission generation)
- **Photos** — Cloudinary (optional, for mission completion photos)

---

## Local development

### Prerequisites

- Node.js 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) (`npm i -g supabase`)
- Docker Desktop (required by `supabase start`)

### 1. Install dependencies

```bash
npm install
```

### 2. Start the local Supabase stack

```bash
supabase start
```

This spins up Postgres (port 54322), Auth, Kong API gateway, and Studio (port 54323). On first run it pulls Docker images — takes a few minutes.

After it starts, look for the **Authentication Keys** section in the output:

```
╭──────────────────────────────────────────────────────────────╮
│ 🔑 Authentication Keys                                       │
├─────────────┬────────────────────────────────────────────────┤
│ Publishable │ sb_publishable_...                             │
│ Secret      │ sb_secret_...                                  │
╰─────────────┴────────────────────────────────────────────────╯
```

Then create `.env.local`:

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_..."   # Publishable key
SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."            # Secret key
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
ANTHROPIC_API_KEY="sk-ant-..."
```

> These keys are fixed demo values — they are the same for every local Supabase project and are not secrets.

### 3. Apply migrations

```bash
supabase db reset
```

This runs all migrations in `supabase/migrations/` in order, creating the schema, auth trigger, permissions, and ID defaults.

### 4. Configure edge function secrets

Create `supabase/functions/.env` (gitignored):

```bash
ANTHROPIC_API_KEY=sk-ant-...
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME   # optional
```

### 5. Start edge functions

In a separate terminal:

```bash
supabase functions serve --env-file supabase/functions/.env
```

Hot-reloads on file changes. Logs appear in this terminal.

### 6. Start the Next.js dev server

```bash
npm run dev
```

App runs at `http://localhost:3000`.  
Supabase Studio runs at `http://localhost:54323`.

### Optional: seed city autocomplete

To enable city autocomplete in preferences, load the city database (~169k entries):

```bash
node scripts/seed-cities.mjs
```

Takes 1–2 minutes. Not required for the app to function.

---

## Project structure

```
app/                    Next.js pages (App Router)
components/             React components
lib/
  supabase-client.ts    Browser Supabase client (@supabase/ssr)
  supabase-server.ts    Server Supabase client (@supabase/ssr)
  api-client.ts         Frontend fetch helpers → Edge Functions
supabase/
  functions/
    _shared/            Shared Deno utilities (auth, cors, supabase admin)
    auth/               POST /register
    missions/           GET / · POST /choose · /complete · /regenerate
    progress/           GET · POST
    history/            GET
    session/            GET
    topic/              POST /reset
    user/               PATCH /preferences
    orgs/               CRUD for organisations and service requests
    cities/             GET /?q= (city autocomplete)
    geolocation/        GET (IP-based city suggestion)
  migrations/           SQL migrations applied in order
scripts/
  seed-cities.mjs       Loads city data into the cities table
```

---

## Deployment

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a project, and note your **project ref** (e.g. `abcdefghijklmnop`).

### 2. Link and push the database schema

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### 3. Set production secrets

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
```

### 4. Deploy edge functions

```bash
supabase functions deploy auth
supabase functions deploy missions
supabase functions deploy progress
supabase functions deploy history
supabase functions deploy session
supabase functions deploy topic
supabase functions deploy user
supabase functions deploy orgs
supabase functions deploy cities
supabase functions deploy geolocation
```

Or deploy all at once:

```bash
supabase functions deploy
```

### 5. Deploy the Next.js frontend

The frontend can be deployed to any platform that supports Next.js (Vercel, Railway, Fly.io, etc.).

Set these environment variables in your hosting platform:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From Supabase project settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase project settings → API (keep secret) |

Example for Vercel:

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel deploy --prod
```

### 6. Update the build script

The current `build` script references Prisma (leftover). Update `package.json`:

```json
"build": "next build"
```

---

## Environment variables reference

### `.env.local` (local dev, never commit)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Local: `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `DATABASE_URL` | Direct Postgres URL (local: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`) |
| `ANTHROPIC_API_KEY` | Anthropic API key (used by Next.js server if needed) |

### `supabase/functions/.env` (edge functions, never commit)

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key for mission generation |
| `CLOUDINARY_URL` | `cloudinary://API_KEY:API_SECRET@CLOUD_NAME` — optional, enables photo uploads |
