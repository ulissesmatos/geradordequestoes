-- CreateEnum
CREATE TYPE "QuestionSetShareVisibility" AS ENUM ('EVERYONE', 'LOGGED_IN', 'PAID_ONLY');

-- AlterTable
ALTER TABLE "QuestionSetShare" ADD COLUMN "visibility" "QuestionSetShareVisibility" NOT NULL DEFAULT 'LOGGED_IN';

-- Retroativo: links já criados por administradores passam a valer para todo mundo (opção
-- padrão pré-selecionada de agora em diante) — links de usuários comuns continuam LOGGED_IN,
-- exatamente o comportamento que já tinham antes desta coluna existir.
UPDATE "QuestionSetShare" q
SET "visibility" = 'EVERYONE'
FROM "User" u
WHERE q."userId" = u.id AND u.role = 'ADMIN';
