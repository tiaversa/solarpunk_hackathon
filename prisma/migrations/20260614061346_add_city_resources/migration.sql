-- CreateTable
-- CityResources caches Solarpunk-aligned local places per (city, topic).
-- Populated lazily on POST /api/mission/choose by querying OpenStreetMap
-- (Nominatim for geocoding + Overpass for tagged places). Shared across
-- all users in the same city.
CREATE TABLE "CityResources" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "centerLat" DOUBLE PRECISION,
    "centerLon" DOUBLE PRECISION,
    "places" JSONB NOT NULL,
    "placesCount" INTEGER NOT NULL DEFAULT 0,
    "querySetVersion" TEXT NOT NULL,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CityResources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CityResources_city_topic_key" ON "CityResources"("city", "topic");

-- CreateIndex
CREATE INDEX "CityResources_city_idx" ON "CityResources"("city");
