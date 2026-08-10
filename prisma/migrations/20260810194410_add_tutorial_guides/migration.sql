-- CreateTable
CREATE TABLE "TutorialGuide" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'ti-book-2',
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TutorialGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorialStep" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TutorialStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TutorialGuide_slug_key" ON "TutorialGuide"("slug");

-- CreateIndex
CREATE INDEX "TutorialGuide_isPublished_displayOrder_idx" ON "TutorialGuide"("isPublished", "displayOrder");

-- CreateIndex
CREATE INDEX "TutorialStep_guideId_order_idx" ON "TutorialStep"("guideId", "order");

-- AddForeignKey
ALTER TABLE "TutorialStep" ADD CONSTRAINT "TutorialStep_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "TutorialGuide"("id") ON DELETE CASCADE ON UPDATE CASCADE;
