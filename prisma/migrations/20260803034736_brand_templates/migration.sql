-- CreateEnum
CREATE TYPE "TemplateKind" AS ENUM ('header', 'footer');

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "footerTemplateId" TEXT,
ADD COLUMN     "headerTemplateId" TEXT;

-- CreateTable
CREATE TABLE "BrandTemplate" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TemplateKind" NOT NULL,
    "html" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandTemplate_brandId_idx" ON "BrandTemplate"("brandId");

-- CreateIndex
CREATE INDEX "BrandTemplate_brandId_kind_idx" ON "BrandTemplate"("brandId", "kind");

-- CreateIndex
CREATE INDEX "Post_headerTemplateId_idx" ON "Post"("headerTemplateId");

-- CreateIndex
CREATE INDEX "Post_footerTemplateId_idx" ON "Post"("footerTemplateId");

-- AddForeignKey
ALTER TABLE "BrandTemplate" ADD CONSTRAINT "BrandTemplate_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_headerTemplateId_fkey" FOREIGN KEY ("headerTemplateId") REFERENCES "BrandTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_footerTemplateId_fkey" FOREIGN KEY ("footerTemplateId") REFERENCES "BrandTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
