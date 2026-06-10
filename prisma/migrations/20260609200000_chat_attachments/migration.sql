-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('IMAGE', 'PDF');

-- CreateTable
CREATE TABLE "AiChatMessageAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "extractedText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiChatMessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiChatMessageAttachment_messageId_idx" ON "AiChatMessageAttachment"("messageId");

-- AddForeignKey
ALTER TABLE "AiChatMessageAttachment" ADD CONSTRAINT "AiChatMessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AiChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
