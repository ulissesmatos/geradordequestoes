-- CreateEnum
CREATE TYPE "MercadoPagoCheckoutMode" AS ENUM ('CHECKOUT_PRO', 'TRANSPARENT');

-- AlterTable
ALTER TABLE "PaymentGatewaySetting" ADD COLUMN     "mercadoPagoCheckoutMode" "MercadoPagoCheckoutMode" NOT NULL DEFAULT 'CHECKOUT_PRO';

-- CreateTable
CREATE TABLE "TeamCharge" (
    "id" TEXT NOT NULL,
    "teamAccountId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "externalId" TEXT,
    "pixQrCode" TEXT,
    "pixQrCodeBase64" TEXT,
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamCharge_teamAccountId_idx" ON "TeamCharge"("teamAccountId");

-- AddForeignKey
ALTER TABLE "TeamCharge" ADD CONSTRAINT "TeamCharge_teamAccountId_fkey" FOREIGN KEY ("teamAccountId") REFERENCES "TeamAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

