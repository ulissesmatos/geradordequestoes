-- AlterTable
ALTER TABLE "User" ADD COLUMN "preferredStates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
