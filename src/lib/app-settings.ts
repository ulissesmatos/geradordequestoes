import { cache } from "react";
import { prisma } from "@/lib/prisma";

/** cache() dedupa chamadas dentro do mesmo request — necessário porque generateMetadata
 *  e o corpo da página chamam isso separadamente para o mesmo request. */
export const getAppSettings = cache(async () => {
  return (
    (await prisma.appSetting.findUnique({ where: { id: "default" } })) ??
    (await prisma.appSetting.create({ data: { id: "default" } }))
  );
});
