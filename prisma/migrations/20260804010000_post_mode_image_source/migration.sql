-- CreateEnum
CREATE TYPE "PostMode" AS ENUM ('worklog', 'topic', 'product');

-- AlterTable
ALTER TABLE "Post" ADD COLUMN "mode" "PostMode" NOT NULL DEFAULT 'worklog';

-- AlterTable
ALTER TABLE "PostImage" ADD COLUMN "sourceMeta" JSONB;

-- CreateIndex
CREATE INDEX "Post_brandId_mode_idx" ON "Post"("brandId", "mode");
