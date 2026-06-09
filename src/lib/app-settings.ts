import { prisma } from "@/lib/prisma";

export async function getAppSettings() {
  return (
    (await prisma.appSetting.findUnique({ where: { id: "default" } })) ??
    (await prisma.appSetting.create({ data: { id: "default" } }))
  );
}
