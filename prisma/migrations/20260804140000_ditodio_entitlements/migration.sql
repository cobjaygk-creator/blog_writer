-- Ditodio unified catalog + monthly usage meters

CREATE TABLE IF NOT EXISTS "Product" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("code")
);

INSERT INTO "Product" ("code", "name") VALUES ('ditodio', 'Ditodio')
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "PlanProduct" ADD COLUMN IF NOT EXISTS "productCode" TEXT NOT NULL DEFAULT 'ditodio';
ALTER TABLE "PlanProduct" ADD COLUMN IF NOT EXISTS "limitsJson" JSONB NOT NULL DEFAULT '{}';

DROP INDEX IF EXISTS "PlanProduct_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "PlanProduct_productCode_code_key" ON "PlanProduct"("productCode", "code");
CREATE INDEX IF NOT EXISTS "PlanProduct_productCode_idx" ON "PlanProduct"("productCode");

ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "productCode" TEXT NOT NULL DEFAULT 'ditodio';
CREATE INDEX IF NOT EXISTS "Subscription_userId_productCode_idx" ON "Subscription"("userId", "productCode");

CREATE TABLE IF NOT EXISTS "UsagePeriod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productCode" TEXT NOT NULL DEFAULT 'ditodio',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "meter" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "UsagePeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UsagePeriod_userId_productCode_periodStart_meter_key"
  ON "UsagePeriod"("userId", "productCode", "periodStart", "meter");
CREATE INDEX IF NOT EXISTS "UsagePeriod_meter_periodStart_idx" ON "UsagePeriod"("meter", "periodStart");
CREATE INDEX IF NOT EXISTS "UsagePeriod_userId_periodStart_idx" ON "UsagePeriod"("userId", "periodStart");

DO $$ BEGIN
 ALTER TABLE "UsagePeriod" ADD CONSTRAINT "UsagePeriod_userId_fkey"
   FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
