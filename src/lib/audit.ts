import { prisma } from "@/lib/prisma";

/** Registra uma ação administrativa para auditoria. Nunca quebra o fluxo principal. */
export async function logAdminAction(
  admin: { id: string; email: string },
  entry: { action: string; entity: string; entityId?: string; summary?: string }
) {
  await prisma.adminAuditLog
    .create({
      data: {
        adminId: admin.id,
        adminEmail: admin.email,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        summary: entry.summary
      }
    })
    .catch(() => undefined);
}
