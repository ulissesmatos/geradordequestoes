-- CreateTable
CREATE TABLE "AiWebSearchCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "resultsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiWebSearchCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiWebSearchCache_cacheKey_key" ON "AiWebSearchCache"("cacheKey");

-- CreateIndex
CREATE INDEX "AiWebSearchCache_createdAt_idx" ON "AiWebSearchCache"("createdAt");
