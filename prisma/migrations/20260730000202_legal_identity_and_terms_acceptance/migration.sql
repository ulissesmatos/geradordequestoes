-- AlterTable
ALTER TABLE "AppSetting" ADD COLUMN     "dpoEmail" TEXT,
ADD COLUMN     "dpoName" TEXT,
ADD COLUMN     "legalEntityCnpj" TEXT,
ADD COLUMN     "legalEntityName" TEXT,
ADD COLUMN     "legalVenueCity" TEXT,
ADD COLUMN     "supportEmail" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3);
