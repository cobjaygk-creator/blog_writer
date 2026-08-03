-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "productFactsJson" JSONB,
ADD COLUMN     "productHighlights" TEXT;

-- AlterTable
ALTER TABLE "SourceImportJob" ALTER COLUMN "targetCount" SET DEFAULT 100;
