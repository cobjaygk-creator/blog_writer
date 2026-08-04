-- CreateTable
CREATE TABLE "PostDraft" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "title" TEXT,
    "titleCandidates" JSONB,
    "body" TEXT NOT NULL,
    "tokenUsage" JSONB,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostDraft_postId_idx" ON "PostDraft"("postId");

-- CreateIndex
CREATE INDEX "PostDraft_postId_isSelected_idx" ON "PostDraft"("postId", "isSelected");

-- CreateIndex
CREATE INDEX "PostDraft_postId_provider_idx" ON "PostDraft"("postId", "provider");

-- AddForeignKey
ALTER TABLE "PostDraft" ADD CONSTRAINT "PostDraft_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
