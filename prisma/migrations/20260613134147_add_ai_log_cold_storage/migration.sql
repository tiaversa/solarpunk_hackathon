-- AlterTable
ALTER TABLE "AiGeneration" ADD COLUMN     "promptSentUrl" TEXT,
ADD COLUMN     "rawResponseUrl" TEXT,
ALTER COLUMN "promptSent" DROP NOT NULL;
