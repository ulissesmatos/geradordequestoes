-- CreateEnum
CREATE TYPE "ReferenceExtractionStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'ERROR');

-- AlterTable
ALTER TABLE "ReferenceDocument" ADD COLUMN "extractionStatus" "ReferenceExtractionStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "ReferenceDocument" ADD COLUMN "extractionCursor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ReferenceDocument" ADD COLUMN "extractionError" TEXT;

-- CreateTable
CREATE TABLE "ReferenceQuestion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "subjectId" TEXT,
    "topicId" TEXT,
    "statement" TEXT NOT NULL,
    "answer" "QuestionAnswer",
    "answerText" TEXT,
    "explanation" TEXT,
    "trickNote" TEXT,
    "hasImage" BOOLEAN NOT NULL DEFAULT false,
    "imageDescription" TEXT,
    "topicHint" TEXT,
    "ordinal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenceQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReferenceQuestion_documentId_idx" ON "ReferenceQuestion"("documentId");
CREATE INDEX "ReferenceQuestion_subjectId_idx" ON "ReferenceQuestion"("subjectId");
CREATE INDEX "ReferenceQuestion_topicId_idx" ON "ReferenceQuestion"("topicId");

-- AddForeignKey
ALTER TABLE "ReferenceQuestion" ADD CONSTRAINT "ReferenceQuestion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ReferenceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
