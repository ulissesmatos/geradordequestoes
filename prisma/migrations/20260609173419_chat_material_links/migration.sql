-- AlterTable
ALTER TABLE "AiChatMessage" ADD COLUMN     "studyMaterialId" TEXT;

-- AddForeignKey
ALTER TABLE "AiChatMessage" ADD CONSTRAINT "AiChatMessage_studyMaterialId_fkey" FOREIGN KEY ("studyMaterialId") REFERENCES "StudyMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;
