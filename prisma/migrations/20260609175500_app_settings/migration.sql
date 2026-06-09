-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "appName" TEXT NOT NULL DEFAULT 'Gerador de Questões',
    "logoUrl" TEXT NOT NULL DEFAULT '/brand/logo.png',
    "faviconUrl" TEXT NOT NULL DEFAULT '/brand/favicon.png',
    "primaryColor" TEXT NOT NULL DEFAULT '#13666a',
    "accentColor" TEXT NOT NULL DEFAULT '#f6d979',
    "publicUrl" TEXT,
    "adminEmails" TEXT NOT NULL DEFAULT '',
    "institutionalText" TEXT NOT NULL DEFAULT 'Plataforma AI-first para gerar questões, simulados, revisões e materiais de estudo para concursos públicos.',
    "termsUrl" TEXT,
    "privacyUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);
