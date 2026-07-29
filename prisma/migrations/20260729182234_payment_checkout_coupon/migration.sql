-- AlterTable
ALTER TABLE "PaymentCheckoutSession" ADD COLUMN     "couponId" TEXT,
ADD COLUMN     "discountCents" INTEGER;

-- AddForeignKey
ALTER TABLE "PaymentCheckoutSession" ADD CONSTRAINT "PaymentCheckoutSession_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
