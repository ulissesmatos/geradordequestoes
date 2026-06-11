-- CreateEnum
CREATE TYPE "TeamAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "TeamSeatStatus" AS ENUM ('PENDING', 'CLAIMED', 'REVOKED');

-- CreateTable
CREATE TABLE "TeamAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "cpfCnpj" TEXT,
    "planId" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "status" "TeamAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodEndsAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamSeat" (
    "id" TEXT NOT NULL,
    "teamAccountId" TEXT NOT NULL,
    "cpf" TEXT,
    "inviteCode" TEXT,
    "userId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "status" "TeamSeatStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamSeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamSeat_inviteCode_key" ON "TeamSeat"("inviteCode");

-- CreateIndex
CREATE INDEX "TeamSeat_teamAccountId_idx" ON "TeamSeat"("teamAccountId");

-- CreateIndex
CREATE INDEX "TeamSeat_cpf_idx" ON "TeamSeat"("cpf");

-- CreateIndex
CREATE INDEX "TeamSeat_userId_idx" ON "TeamSeat"("userId");

-- AddForeignKey
ALTER TABLE "TeamAccount" ADD CONSTRAINT "TeamAccount_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamSeat" ADD CONSTRAINT "TeamSeat_teamAccountId_fkey" FOREIGN KEY ("teamAccountId") REFERENCES "TeamAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

