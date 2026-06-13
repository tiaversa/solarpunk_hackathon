-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredDuration" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- Auto-bump "updatedAt" on every UPDATE. Prisma stores camelCase fields as
-- quoted camelCase columns in Postgres, so moddatetime() must be passed the
-- quoted column name (NOT updated_at).
CREATE TRIGGER set_updated_at_users
  BEFORE UPDATE ON "User"
  FOR EACH ROW EXECUTE FUNCTION moddatetime("updatedAt");
