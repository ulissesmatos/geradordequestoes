-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('OPENAI', 'CLAUDE', 'OPENROUTER');

-- CreateTable
CREATE TABLE "AiProviderSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "provider" "AiProvider" NOT NULL DEFAULT 'OPENAI',
    "apiKey" TEXT,
    "model" TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
    "baseUrl" TEXT,
    "siteUrl" TEXT,
    "appName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderSetting_pkey" PRIMARY KEY ("id")
);
