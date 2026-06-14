-- AlterTable
-- rankedPlaces stores the per-MissionChoice top-N places picked by
-- Claude in POST /api/mission/choose. Nullable so existing rows (and
-- ranking failures) stay valid; the topic page falls back to the raw
-- CityResources list when null.
ALTER TABLE "MissionChoice" ADD COLUMN "rankedPlaces" JSONB;
