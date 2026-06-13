# Supabase Storage setup

Mission completion photos go to a private Supabase Storage bucket. The
browser uploads directly via signed upload URLs, and history reads use
signed read URLs minted server-side. No bytes flow through the Next.js
route, which sidesteps the 4.5 MB Vercel body-size limit and removes the
33% base64 overhead.

This is a one-time setup per Supabase project. Production and local dev
both target the same project (we don't currently shard photos by
environment).

## 1. Create the bucket

In the Supabase dashboard:

- **Storage → New bucket**
- Name: `mission-photos`
- **Public bucket**: off (private)
- **File size limit**: 5 MB
- **Allowed MIME types**: `image/jpeg, image/png, image/webp, image/heic`

(Or run the SQL below in **SQL Editor → New query**, which does the same
thing and is the recommended path if you want the setup to be
reproducible across environments.)

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mission-photos',
  'mission-photos',
  false,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;
```

## 2. Lock down access with RLS (optional but recommended)

The Next.js route mints upload tokens scoped to `{userId}/{uuid}.jpg`
using the service-role key, so a browser can never write outside its
own folder via our app. The block below adds a second line of defence
at the storage layer itself — useful if you ever bypass the app (e.g.
mobile client, third-party integration).

```sql
-- Owners can read their own objects
create policy "mission-photos owners read"
on storage.objects for select to authenticated
using (
  bucket_id = 'mission-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Owners can write under their own folder
create policy "mission-photos owners write"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'mission-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

These policies use Supabase Auth's `auth.uid()`. Our app uses NextAuth,
not Supabase Auth, so the policies above only kick in if you start
issuing Supabase Auth tokens too. Until then, the service-role key
the server uses bypasses RLS entirely — which is fine, because the
server-side path validation already enforces ownership.

## 3. Copy the keys into `.env`

In the dashboard: **Settings → API**. Three values matter:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **`anon` public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **`service_role` secret key** → `SUPABASE_SERVICE_ROLE_KEY`

Only the service-role key is sensitive. Treat it like a password — never
commit it, never log it, never expose it to the browser.

## 4. Apply the Prisma migration

The `Completion.photoUrl` column was renamed to `photoPath` (it now
stores a bucket-relative key, not a CDN URL). Run:

```bash
npm run db:migrate:dev
```

This applies `prisma/migrations/20260613172000_rename_completion_photo_url_to_path/`
which is a single `ALTER TABLE ... RENAME COLUMN` statement.

## 5. Verify

- Visit a topic, complete a mission with a photo.
- Check the bucket: an object named `<userId>/<uuid>.jpg` should appear
  in **Storage → mission-photos**.
- Visit `/history`. The photo should render — it's served via a 1-hour
  signed URL minted at page render time.

## What changed in the code

| Surface                          | Before                                                                 | After                                                                |
| -------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `lib/cloudinary.ts`              | Read `CLOUDINARY_URL`, uploaded base64 from server.                    | Deleted.                                                             |
| `lib/cloudStorage.ts`            | Cloudinary raw-resource hack for AI logs (unused at runtime).          | Deleted.                                                             |
| `lib/supabase.ts`                | —                                                                      | Server + browser clients; `signedReadUrl()`; `buildPhotoPath()`.     |
| `app/api/photo/upload-url/`      | —                                                                      | New route. Mints `{ path, token }` for direct browser upload.        |
| `app/api/mission/complete/`      | Accepted `photoBase64`; uploaded to Cloudinary before transaction.     | Accepts `photoPath`; validates ownership; no external calls.         |
| `lib/api-client.ts::uploadPhoto` | `FileReader.readAsDataURL` returning a base64 string.                  | Two-step: POST upload-url, then direct upload via signed URL.        |
| `PendingAction.complete`         | `photoBase64: string \| null`.                                         | `photoBlob: Blob \| null`. Dexie stores Blob natively.               |
| `Completion.photoUrl`            | Cloudinary CDN URL.                                                    | Renamed to `photoPath`. Display URLs minted on read.                 |
