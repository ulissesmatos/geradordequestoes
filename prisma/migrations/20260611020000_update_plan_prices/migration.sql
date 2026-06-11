-- Correção única dos preços dos planos base (Essencial / Pro / Premium).
-- Roda via `prisma migrate deploy` no deploy. Como o seed deixou de sobrescrever
-- (update: {}), esta migração é a fonte de verdade para alinhar os preços atuais;
-- edições posteriores no painel admin passam a persistir entre deploys.
UPDATE "SubscriptionPlan" SET "priceCents" = 1990 WHERE "slug" = 'essencial';
UPDATE "SubscriptionPlan" SET "priceCents" = 4990 WHERE "slug" = 'pro';
UPDATE "SubscriptionPlan" SET "priceCents" = 14990 WHERE "slug" = 'premium';
