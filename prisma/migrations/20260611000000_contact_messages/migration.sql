-- CreateEnum
CREATE TYPE "ContactMessageKind" AS ENUM ('GENERAL', 'TEAMS');

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "kind" "ContactMessageKind" NOT NULL DEFAULT 'GENERAL',
    "userId" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactMessage_kind_idx" ON "ContactMessage"("kind");

-- CreateIndex
CREATE INDEX "ContactMessage_handledAt_idx" ON "ContactMessage"("handledAt");

