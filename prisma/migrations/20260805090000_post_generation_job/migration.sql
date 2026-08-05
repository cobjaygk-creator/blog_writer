-- CreateEnum
CREATE TYPE "GenerationJobStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "GenerationJobKind" AS ENUM ('generate', 'generate_topic');

-- CreateTable
CREATE TABLE "PostGenerationJob" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "GenerationJobKind" NOT NULL,
    "status" "GenerationJobStatus" NOT NULL DEFAULT 'pending',
    "phase" TEXT NOT NULL DEFAULT 'pending',
    "requestJson" JSONB NOT NULL,
    "contextJson" JSONB,
    "resultJson" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostGenerationJob_postId_status_idx" ON "PostGenerationJob"("postId", "status");

-- CreateIndex
CREATE INDEX "PostGenerationJob_userId_status_idx" ON "PostGenerationJob"("userId", "status");

-- AddForeignKey
ALTER TABLE "PostGenerationJob" ADD CONSTRAINT "PostGenerationJob_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostGenerationJob" ADD CONSTRAINT "PostGenerationJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
