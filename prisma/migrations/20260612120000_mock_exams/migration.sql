-- CreateEnum
CREATE TYPE "MockExamStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "MockExam" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "questionSetId" TEXT NOT NULL,
    "teamAccountId" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "status" "MockExamStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockExam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockExamSession" (
    "id" TEXT NOT NULL,
    "mockExamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "netScore" INTEGER,
    "correctCount" INTEGER,
    "wrongCount" INTEGER,
    "blankCount" INTEGER,
    "totalSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MockExamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockExamAnswer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userAnswer" "QuestionAnswer",
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockExamAnswer_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "QuestionAttempt" ADD COLUMN "mockExamSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "MockExam_questionSetId_key" ON "MockExam"("questionSetId");
CREATE INDEX "MockExam_status_idx" ON "MockExam"("status");
CREATE INDEX "MockExam_teamAccountId_idx" ON "MockExam"("teamAccountId");
CREATE UNIQUE INDEX "MockExamSession_mockExamId_userId_key" ON "MockExamSession"("mockExamId", "userId");
CREATE INDEX "MockExamSession_mockExamId_finishedAt_idx" ON "MockExamSession"("mockExamId", "finishedAt");
CREATE UNIQUE INDEX "MockExamAnswer_sessionId_questionId_key" ON "MockExamAnswer"("sessionId", "questionId");

-- AddForeignKey
ALTER TABLE "MockExam" ADD CONSTRAINT "MockExam_questionSetId_fkey" FOREIGN KEY ("questionSetId") REFERENCES "QuestionSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MockExam" ADD CONSTRAINT "MockExam_teamAccountId_fkey" FOREIGN KEY ("teamAccountId") REFERENCES "TeamAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MockExam" ADD CONSTRAINT "MockExam_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MockExamSession" ADD CONSTRAINT "MockExamSession_mockExamId_fkey" FOREIGN KEY ("mockExamId") REFERENCES "MockExam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MockExamSession" ADD CONSTRAINT "MockExamSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MockExamAnswer" ADD CONSTRAINT "MockExamAnswer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MockExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MockExamAnswer" ADD CONSTRAINT "MockExamAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_mockExamSessionId_fkey" FOREIGN KEY ("mockExamSessionId") REFERENCES "MockExamSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
