-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('MARKETING', 'INFRAESTRUTURA', 'FERRAMENTAS_SAAS', 'FOLHA_PESSOAL', 'TAXAS_GATEWAY', 'IMPOSTOS', 'JURIDICO_CONTABILIDADE', 'OUTROS');

-- CreateEnum
CREATE TYPE "MarketingChannel" AS ENUM ('GOOGLE_ADS', 'META_ADS', 'TIKTOK_ADS', 'YOUTUBE_ADS', 'ORGANICO_SOCIAL', 'EMAIL', 'SEO', 'AFILIADOS', 'INDICACAO', 'OUTRO');

-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "MarketingChannel" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "budgetCents" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "competenceDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "vendor" TEXT,
    "campaignId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_category_competenceDate_idx" ON "Expense"("category", "competenceDate");

-- CreateIndex
CREATE INDEX "Expense_campaignId_idx" ON "Expense"("campaignId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
