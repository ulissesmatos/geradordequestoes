-- AlterEnum
ALTER TYPE "ExpenseCategory" ADD VALUE 'DISTRIBUICAO_LUCROS';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "countsAsExpense" BOOLEAN NOT NULL DEFAULT true;
