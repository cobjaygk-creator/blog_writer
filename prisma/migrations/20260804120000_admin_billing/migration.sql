-- Admin console, billing, usage metering, integration secrets

CREATE TYPE "UserRole" AS ENUM ('user', 'admin');
CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'expired', 'paused');
CREATE TYPE "BillingInterval" AS ENUM ('monthly', 'yearly');
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'canceled', 'refunded', 'partial_refund');

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'user';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "planOverrideCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "planOverrideNote" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "planOverrideUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tossCustomerKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_tossCustomerKey_key" ON "User"("tossCustomerKey");

CREATE TABLE IF NOT EXISTS "PlanProduct" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isPurchasable" BOOLEAN NOT NULL DEFAULT false,
    "brandsLimit" INTEGER NOT NULL,
    "sourcePostsPerBrand" INTEGER NOT NULL,
    "postsPerDay" INTEGER NOT NULL,
    "imagesPerPost" INTEGER NOT NULL,
    "generatesPerDay" INTEGER NOT NULL DEFAULT 20,
    "dualGenerationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "priceMonthlyKrw" INTEGER NOT NULL DEFAULT 0,
    "priceYearlyKrw" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "taxIncluded" BOOLEAN NOT NULL DEFAULT true,
    "tossBillingProductCode" TEXT,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlanProduct_code_key" ON "PlanProduct"("code");

CREATE TABLE IF NOT EXISTS "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planProductId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "interval" "BillingInterval" NOT NULL DEFAULT 'monthly',
    "tossBillingKey" TEXT,
    "tossCustomerKey" TEXT NOT NULL,
    "tossOrderIdPrefix" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Subscription_userId_idx" ON "Subscription"("userId");
CREATE INDEX IF NOT EXISTS "Subscription_status_idx" ON "Subscription"("status");

CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "status" "PaymentStatus" NOT NULL,
    "amountKrw" INTEGER NOT NULL,
    "vatKrw" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "tossPaymentKey" TEXT,
    "tossOrderId" TEXT NOT NULL,
    "method" TEXT,
    "receiptUrl" TEXT,
    "failCode" TEXT,
    "failMessage" TEXT,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "rawWebhookJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_tossPaymentKey_key" ON "Payment"("tossPaymentKey");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_tossOrderId_key" ON "Payment"("tossOrderId");
CREATE INDEX IF NOT EXISTS "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Payment_subscriptionId_idx" ON "Payment"("subscriptionId");

CREATE TABLE IF NOT EXISTS "Promotion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "percentOff" INTEGER,
    "amountOffKrw" INTEGER,
    "durationMonths" INTEGER NOT NULL DEFAULT 1,
    "maxRedemptions" INTEGER,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "applicablePlans" TEXT[],
    "activeFrom" TIMESTAMP(3),
    "activeUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Promotion_code_key" ON "Promotion"("code");

CREATE TABLE IF NOT EXISTS "UsageDaily" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "postsCreated" INTEGER NOT NULL DEFAULT 0,
    "generates" INTEGER NOT NULL DEFAULT 0,
    "llmInputTokens" INTEGER NOT NULL DEFAULT 0,
    "llmOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "imagesUploaded" INTEGER NOT NULL DEFAULT 0,
    "estCostKrw" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UsageDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UsageDaily_userId_day_key" ON "UsageDaily"("userId", "day");
CREATE INDEX IF NOT EXISTS "UsageDaily_day_idx" ON "UsageDaily"("day");

CREATE TABLE IF NOT EXISTS "ApiUsageDaily" (
    "id" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "slot" TEXT NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "successes" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "inputUnits" INTEGER NOT NULL DEFAULT 0,
    "outputUnits" INTEGER NOT NULL DEFAULT 0,
    "estCostKrw" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ApiUsageDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ApiUsageDaily_day_slot_key" ON "ApiUsageDaily"("day", "slot");
CREATE INDEX IF NOT EXISTS "ApiUsageDaily_slot_day_idx" ON "ApiUsageDaily"("slot", "day");

CREATE TABLE IF NOT EXISTS "IntegrationSecret" (
    "id" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "publicConfig" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "hintJson" JSONB,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastVerifyOk" BOOLEAN,
    "lastVerifyError" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationSecret_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationSecret_slot_key" ON "IntegrationSecret"("slot");

CREATE TABLE IF NOT EXISTS "AdminSetting" (
    "key" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminSetting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_actorId_idx" ON "AdminAuditLog"("actorId");

DO $$ BEGIN
 ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planProductId_fkey" FOREIGN KEY ("planProductId") REFERENCES "PlanProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "UsageDaily" ADD CONSTRAINT "UsageDaily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
