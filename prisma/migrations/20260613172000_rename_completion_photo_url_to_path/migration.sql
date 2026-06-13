-- Rename Completion.photoUrl -> Completion.photoPath as part of the
-- Cloudinary -> Supabase Storage migration. The column now holds a
-- bucket-relative path (e.g. "{userId}/{uuid}.jpg"), not a public URL.
-- Display URLs are minted at read time via signed URLs.
--
-- Safe to run as a plain rename because no real production photos exist
-- yet — the Cloudinary path was placeholder-only.
ALTER TABLE "Completion" RENAME COLUMN "photoUrl" TO "photoPath";
