-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "sourceReferenceQuestionId" TEXT;

-- CreateIndex
CREATE INDEX "Question_sourceReferenceQuestionId_idx" ON "Question"("sourceReferenceQuestionId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_sourceReferenceQuestionId_fkey" FOREIGN KEY ("sourceReferenceQuestionId") REFERENCES "ReferenceQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
