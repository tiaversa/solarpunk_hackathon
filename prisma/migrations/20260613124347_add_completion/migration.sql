-- CreateTable
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Completion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Completion_userId_topic_level_idx" ON "Completion"("userId", "topic", "level");

-- AddForeignKey
ALTER TABLE "Completion" ADD CONSTRAINT "Completion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enforce that aiGenerationId and chosenMissionIndex are either both
-- present or both null — no half-populated completion rows.
ALTER TABLE "Completion"
  ADD CONSTRAINT completion_generation_index_paired CHECK (
    ("aiGenerationId" IS NULL) = ("chosenMissionIndex" IS NULL)
  );

-- Auto-bump "updatedAt" on every UPDATE. Same quoted-camelCase pattern
-- as the User and Progress triggers.
CREATE TRIGGER set_updated_at_completion
  BEFORE UPDATE ON "Completion"
  FOR EACH ROW EXECUTE FUNCTION moddatetime("updatedAt");
