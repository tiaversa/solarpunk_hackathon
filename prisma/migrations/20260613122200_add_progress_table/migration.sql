-- CreateTable
CREATE TABLE "Progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "currentLevel" INTEGER NOT NULL DEFAULT 1,
    "completedLevels" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Progress_userId_idx" ON "Progress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Progress_userId_topic_key" ON "Progress"("userId", "topic");

-- AddForeignKey
ALTER TABLE "Progress" ADD CONSTRAINT "Progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Auto-bump "updatedAt" on every UPDATE. Same quoted-camelCase pattern as
-- the User trigger in Step 2; do NOT use the snake_case updated_at name.
CREATE TRIGGER set_updated_at_progress
  BEFORE UPDATE ON "Progress"
  FOR EACH ROW EXECUTE FUNCTION moddatetime("updatedAt");
