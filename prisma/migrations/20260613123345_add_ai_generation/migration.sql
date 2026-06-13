-- CreateTable
CREATE TABLE "AiGeneration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "missionTypeLabel" TEXT NOT NULL,
    "matrixCellText" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "promptSent" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "preferenceSummarySent" TEXT,
    "model" TEXT NOT NULL,
    "rawResponse" JSONB,
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

-- CreateIndex
CREATE INDEX "AiGeneration_userId_topic_level_status_idx" ON "AiGeneration"("userId", "topic", "level", "status");

-- AddForeignKey
ALTER TABLE "AiGeneration" ADD CONSTRAINT "AiGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
