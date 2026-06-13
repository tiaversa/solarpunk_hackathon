-- CreateTable
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

-- CreateTable
CREATE TABLE "UserPreferenceSummary" (
    "userId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "basedOn" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPreferenceSummary_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "MissionChoice_userId_topic_level_status_idx" ON "MissionChoice"("userId", "topic", "level", "status");

-- AddForeignKey
ALTER TABLE "MissionChoice" ADD CONSTRAINT "MissionChoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionChoice" ADD CONSTRAINT "MissionChoice_aiGenerationId_fkey" FOREIGN KEY ("aiGenerationId") REFERENCES "AiGeneration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreferenceSummary" ADD CONSTRAINT "UserPreferenceSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial unique index: enforces at most one active choice per
-- user+topic+level, preventing race-condition double-inserts even if two
-- POST /api/mission/choose requests land at the same instant.
CREATE UNIQUE INDEX unique_active_choice
  ON "MissionChoice" ("userId", topic, level)
  WHERE status = 'active';

-- Trigger function: invalidate the preference summary cache when a
-- new MissionChoice is inserted (covers both choose and complete events,
-- since complete UPDATEs the existing active row; choose may INSERT a
-- fresh active row when none exists yet).
CREATE OR REPLACE FUNCTION invalidate_pref_summary_on_choice()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM "UserPreferenceSummary" WHERE "userId" = NEW."userId";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invalidate_summary_on_choice
  AFTER INSERT ON "MissionChoice"
  FOR EACH ROW EXECUTE FUNCTION invalidate_pref_summary_on_choice();

-- Trigger function: invalidate the preference summary cache when the
-- user's interests or preferredDuration change. The compound IS DISTINCT
-- FROM check handles NULL transitions correctly.
CREATE OR REPLACE FUNCTION invalidate_pref_summary_on_user_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.interests IS DISTINCT FROM NEW.interests
     OR OLD."preferredDuration" IS DISTINCT FROM NEW."preferredDuration" THEN
    DELETE FROM "UserPreferenceSummary" WHERE "userId" = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invalidate_summary_on_user_update
  AFTER UPDATE ON "User"
  FOR EACH ROW EXECUTE FUNCTION invalidate_pref_summary_on_user_update();
