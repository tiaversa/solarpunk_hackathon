-- Move lat/lng from User (unused) to AiGeneration (captured at mission time).
ALTER TABLE "User" DROP COLUMN IF EXISTS "latitude";
ALTER TABLE "User" DROP COLUMN IF EXISTS "longitude";

ALTER TABLE "AiGeneration"
  ADD COLUMN IF NOT EXISTS "latitude"  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
