-- Community organisations and their service requests.
-- ServiceRequests are matched to mission generations when the user has GPS
-- coords and is at level >= 2 (Make) so missions can connect to real local needs.

CREATE TABLE "Organization" (
  "id"              TEXT             NOT NULL PRIMARY KEY,
  "name"            TEXT             NOT NULL,
  "description"     TEXT,
  "email"           TEXT             NOT NULL,
  "phone"           TEXT,
  "website"         TEXT,
  "city"            TEXT,
  "lat"             DOUBLE PRECISION,
  "lng"             DOUBLE PRECISION,
  "createdByUserId" TEXT             NOT NULL REFERENCES "User"("id"),
  "createdAt"       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  CONSTRAINT "Organization_email_key" UNIQUE ("email")
);

CREATE INDEX "Organization_createdByUserId_idx" ON "Organization"("createdByUserId");

CREATE TABLE "ServiceRequest" (
  "id"                TEXT             NOT NULL PRIMARY KEY,
  "organizationId"    TEXT             NOT NULL REFERENCES "Organization"("id"),
  "category"          TEXT             NOT NULL,
  "title"             TEXT             NOT NULL,
  "description"       TEXT             NOT NULL,
  "lat"               DOUBLE PRECISION NOT NULL,
  "lng"               DOUBLE PRECISION NOT NULL,
  "radiusKm"          DOUBLE PRECISION NOT NULL DEFAULT 5,
  "capacityTotal"     INTEGER          NOT NULL DEFAULT 1,
  "capacityRemaining" INTEGER          NOT NULL DEFAULT 1,
  "expiresAt"         TIMESTAMPTZ,
  "status"            TEXT             NOT NULL DEFAULT 'open',
  "createdAt"         TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX "ServiceRequest_status_category_idx" ON "ServiceRequest"("status", "category");
CREATE INDEX "ServiceRequest_organizationId_idx"  ON "ServiceRequest"("organizationId");
CREATE INDEX "ServiceRequest_lat_lng_idx"         ON "ServiceRequest"("lat", "lng");
