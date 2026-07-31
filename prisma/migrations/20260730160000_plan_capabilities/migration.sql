-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "capabilities" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "AppSetting" ADD COLUMN     "trialCapabilities" JSONB NOT NULL DEFAULT '{}';

-- Preserva o estado atual de materialExpandEnabled dentro do JSON. A coluna antiga
-- continua existindo por um release (rollback), mas a leitura passa a ser pelo registry.
UPDATE "SubscriptionPlan"
SET "capabilities" = jsonb_build_object('materialExpand', "materialExpandEnabled");
