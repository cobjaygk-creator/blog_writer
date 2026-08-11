-- AlterTable
ALTER TABLE "SourcePost" ADD COLUMN IF NOT EXISTS "vehicle" TEXT;
ALTER TABLE "SourcePost" ADD COLUMN IF NOT EXISTS "part" TEXT;
ALTER TABLE "SourcePost" ADD COLUMN IF NOT EXISTS "productKey" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SourcePost_brandId_productKey_idx" ON "SourcePost"("brandId", "productKey");
