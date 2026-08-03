-- CreateEnum
CREATE TYPE "PopupKind" AS ENUM ('ANNOUNCEMENT', 'UPGRADE');

-- CreateEnum
CREATE TYPE "PopupAudience" AS ENUM ('ALL', 'FREE', 'PAYING');

-- CreateTable
CREATE TABLE "Popup" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "PopupKind" NOT NULL DEFAULT 'ANNOUNCEMENT',
    "eyebrow" TEXT,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "dismissLabel" TEXT NOT NULL DEFAULT 'Agora não',
    "audience" "PopupAudience" NOT NULL DEFAULT 'ALL',
    "repeatAfterHours" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Popup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopupUserState" (
    "id" TEXT NOT NULL,
    "popupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastShownAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PopupUserState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Popup_isActive_startsAt_endsAt_idx" ON "Popup"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "PopupUserState_userId_idx" ON "PopupUserState"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PopupUserState_popupId_userId_key" ON "PopupUserState"("popupId", "userId");

-- AddForeignKey
ALTER TABLE "PopupUserState" ADD CONSTRAINT "PopupUserState_popupId_fkey" FOREIGN KEY ("popupId") REFERENCES "Popup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopupUserState" ADD CONSTRAINT "PopupUserState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
