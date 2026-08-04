-- CreateEnum
CREATE TYPE "StripeCancelMode" AS ENUM ('IMMEDIATE', 'AT_PERIOD_END');

-- CreateEnum
CREATE TYPE "StripeProrationBehavior" AS ENUM ('NONE', 'CREATE_PRORATIONS');

-- AlterTable
ALTER TABLE "PaymentGatewaySetting"
    ADD COLUMN "stripeCancelMode" "StripeCancelMode" NOT NULL DEFAULT 'AT_PERIOD_END',
    ADD COLUMN "stripeProrationBehavior" "StripeProrationBehavior" NOT NULL DEFAULT 'CREATE_PRORATIONS',
    ADD COLUMN "stripePortalConfigurationId" TEXT,
    ADD COLUMN "pixReminderAfterHours" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "PaymentCheckoutSession"
    ADD COLUMN "reminderSentAt" TIMESTAMP(3);
