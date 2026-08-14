-- DropIndex
DROP INDEX "MockExamSession_mockExamId_userId_key";

-- AlterTable
ALTER TABLE "MockExamSession" ADD COLUMN     "isPractice" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "MockExamSession_mockExamId_userId_idx" ON "MockExamSession"("mockExamId", "userId");
