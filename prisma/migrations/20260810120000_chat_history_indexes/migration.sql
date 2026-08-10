-- Histórico de chat por usuário no painel admin varre AiChatMessage filtrando pela sessão e
-- ordenando por data. Sem índice isso é seq scan + sort na tabela que mais cresce no banco.
-- O índice de AiChatSession já era devido de qualquer jeito: a sidebar do chat lista as
-- sessões do usuário por updatedAt a cada abertura de /ai.

-- CreateIndex
CREATE INDEX "AiChatSession_userId_updatedAt_idx" ON "AiChatSession"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiChatMessage_sessionId_createdAt_idx" ON "AiChatMessage"("sessionId", "createdAt");
