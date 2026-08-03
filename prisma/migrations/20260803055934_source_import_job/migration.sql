-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('pending', 'listing', 'fetching', 'learning', 'completed', 'failed');

-- AlterTable
ALTER TABLE "SourcePost" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "SourceImportJob" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'pending',
    "targetCount" INTEGER NOT NULL DEFAULT 30,
    "listedCount" INTEGER NOT NULL DEFAULT 0,
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "itemsJson" JSONB NOT NULL,
    "error" TEXT,
    "autoLearn" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceImportJob_brandId_idx" ON "SourceImportJob"("brandId");

-- CreateIndex
CREATE INDEX "SourceImportJob_brandId_status_idx" ON "SourceImportJob"("brandId", "status");

-- CreateIndex
CREATE INDEX "SourcePost_brandId_sourceUrl_idx" ON "SourcePost"("brandId", "sourceUrl");

-- CreateIndex
CREATE INDEX "SourcePost_brandId_externalId_idx" ON "SourcePost"("brandId", "externalId");

-- AddForeignKey
ALTER TABLE "SourceImportJob" ADD CONSTRAINT "SourceImportJob_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
