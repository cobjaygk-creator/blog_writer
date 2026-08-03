-- AlterTable
ALTER TABLE "PostImage" ADD COLUMN "groupId" TEXT;

-- CreateIndex
CREATE INDEX "PostImage_postId_groupId_idx" ON "PostImage"("postId", "groupId");
