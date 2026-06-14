-- Initial schema from Prisma (state before Supabase Auth migration)

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "city" TEXT,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredDuration" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "currentLevel" INTEGER NOT NULL DEFAULT 1,
    "completedLevels" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiGeneration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "missionTypeLabel" TEXT NOT NULL,
    "matrixCellText" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "promptSent" TEXT,
    "promptSentUrl" TEXT,
    "promptVersion" TEXT NOT NULL,
    "preferenceSummarySent" TEXT,
    "model" TEXT NOT NULL,
    "rawResponse" JSONB,
    "rawResponseUrl" TEXT,
    "parsedOptions" JSONB,
    "optionsCount" INTEGER NOT NULL DEFAULT 3,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER,
    "error" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiGeneration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MissionChoice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "aiGenerationId" TEXT NOT NULL,
    "optionsPresented" JSONB NOT NULL,
    "chosenIndex" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "chosenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MissionChoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserPreferenceSummary" (
    "userId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "basedOn" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPreferenceSummary_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "website" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radiusKm" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "capacityTotal" INTEGER NOT NULL DEFAULT 1,
    "capacityRemaining" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Completion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "aiGenerationId" TEXT,
    "chosenMissionIndex" INTEGER,
    "photoUrl" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Completion_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Progress_userId_idx" ON "Progress"("userId");
CREATE UNIQUE INDEX "Progress_userId_topic_key" ON "Progress"("userId", "topic");
CREATE INDEX "AiGeneration_userId_topic_level_status_idx" ON "AiGeneration"("userId", "topic", "level", "status");
CREATE INDEX "MissionChoice_userId_topic_level_status_idx" ON "MissionChoice"("userId", "topic", "level", "status");
CREATE UNIQUE INDEX "Organization_email_key" ON "Organization"("email");
CREATE INDEX "Organization_createdByUserId_idx" ON "Organization"("createdByUserId");
CREATE INDEX "ServiceRequest_status_category_idx" ON "ServiceRequest"("status", "category");
CREATE INDEX "ServiceRequest_organizationId_idx" ON "ServiceRequest"("organizationId");
CREATE INDEX "ServiceRequest_lat_lng_idx" ON "ServiceRequest"("lat", "lng");
CREATE INDEX "Completion_userId_topic_level_idx" ON "Completion"("userId", "topic", "level");

-- Foreign keys
ALTER TABLE "Progress" ADD CONSTRAINT "Progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiGeneration" ADD CONSTRAINT "AiGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MissionChoice" ADD CONSTRAINT "MissionChoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MissionChoice" ADD CONSTRAINT "MissionChoice_aiGenerationId_fkey" FOREIGN KEY ("aiGenerationId") REFERENCES "AiGeneration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserPreferenceSummary" ADD CONSTRAINT "UserPreferenceSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Completion" ADD CONSTRAINT "Completion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
