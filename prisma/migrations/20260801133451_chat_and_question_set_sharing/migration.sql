-- CreateTable
CREATE TABLE "QuestionSetShare" (
    "id" TEXT NOT NULL,
    "questionSetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "QuestionSetShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatShare" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sharedUpTo" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ChatShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuestionSetShare_questionSetId_key" ON "QuestionSetShare"("questionSetId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatShare_sessionId_key" ON "ChatShare"("sessionId");

-- AddForeignKey
ALTER TABLE "QuestionSetShare" ADD CONSTRAINT "QuestionSetShare_questionSetId_fkey" FOREIGN KEY ("questionSetId") REFERENCES "QuestionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionSetShare" ADD CONSTRAINT "QuestionSetShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatShare" ADD CONSTRAINT "ChatShare_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatShare" ADD CONSTRAINT "ChatShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
