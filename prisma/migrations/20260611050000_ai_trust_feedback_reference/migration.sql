-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('GABARITO_ERRADO', 'ENUNCIADO_CONFUSO', 'DESATUALIZADA', 'OUTRO');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('PENDING', 'REVIEWED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ReferenceKind" AS ENUM ('PROVA', 'GABARITO', 'LEI', 'RESUMO', 'OUTRO');

-- AlterTable
ALTER TABLE "AiProviderSetting" ADD COLUMN     "webSearchApiKey" TEXT,
ADD COLUMN     "webSearchEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "QuestionFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "type" "FeedbackType" NOT NULL DEFAULT 'OUTRO',
    "message" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT,
    "kind" "ReferenceKind" NOT NULL DEFAULT 'OUTRO',
    "subjectId" TEXT,
    "topicId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "subjectId" TEXT,
    "topicId" TEXT,
    "content" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenceChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionFeedback_status_idx" ON "QuestionFeedback"("status");

-- CreateIndex
CREATE INDEX "QuestionFeedback_questionId_idx" ON "QuestionFeedback"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionFeedback_userId_questionId_key" ON "QuestionFeedback"("userId", "questionId");

-- CreateIndex
CREATE INDEX "ReferenceChunk_documentId_idx" ON "ReferenceChunk"("documentId");

-- CreateIndex
CREATE INDEX "ReferenceChunk_subjectId_idx" ON "ReferenceChunk"("subjectId");

-- CreateIndex
CREATE INDEX "ReferenceChunk_topicId_idx" ON "ReferenceChunk"("topicId");

-- AddForeignKey
ALTER TABLE "QuestionFeedback" ADD CONSTRAINT "QuestionFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionFeedback" ADD CONSTRAINT "QuestionFeedback_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceChunk" ADD CONSTRAINT "ReferenceChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ReferenceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Índice full-text (português) para busca por palavra-chave nos trechos de referência.
CREATE INDEX "ReferenceChunk_content_fts_idx" ON "ReferenceChunk" USING GIN (to_tsvector('portuguese', "content"));
