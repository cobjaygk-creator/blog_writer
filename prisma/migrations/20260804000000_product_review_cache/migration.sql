-- CreateTable
CREATE TABLE "ProductReviewCache" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "reviewThemesJson" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductReviewCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductReviewCache_brandId_idx" ON "ProductReviewCache"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReviewCache_brandId_productName_key" ON "ProductReviewCache"("brandId", "productName");

-- AddForeignKey
ALTER TABLE "ProductReviewCache" ADD CONSTRAINT "ProductReviewCache_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
