-- AlterTable
ALTER TABLE "User" ADD COLUMN     "reviewReminderOptOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewReminderSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "QuestionReviewState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "correctStreak" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "lastIsCorrect" BOOLEAN NOT NULL,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionReviewState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionReviewState_userId_dueAt_idx" ON "QuestionReviewState"("userId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionReviewState_userId_questionId_key" ON "QuestionReviewState"("userId", "questionId");

-- AddForeignKey
ALTER TABLE "QuestionReviewState" ADD CONSTRAINT "QuestionReviewState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReviewState" ADD CONSTRAINT "QuestionReviewState_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
