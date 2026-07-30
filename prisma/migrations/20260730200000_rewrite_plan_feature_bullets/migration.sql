-- Os bullets gravados usavam `{limit}`, que significava "gerações por dia". Agora `{limit}`
-- resolve para a cota MENSAL de questões, então deixar o texto antigo faria o card anunciar
-- "Até 9000 usos de IA por dia" — número certo, frase errada.
--
-- Só mexe em quem ainda tem a linha padrão: bullet escrito à mão pelo admin não é sobrescrito.
UPDATE "SubscriptionPlan"
SET "features" =
  ARRAY[
    '{questoesMes} questões geradas por mês',
    'Blocos de até {questoesBloco} questões de uma vez'
  ]::text[]
  || array_remove("features", 'Até {limit} usos de IA por dia')
WHERE 'Até {limit} usos de IA por dia' = ANY("features");
