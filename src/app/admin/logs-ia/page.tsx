import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export default async function AiLogsPage() {
  const logs = await prisma.aiGenerationLog.findMany({
    include: { admin: true, subject: true, topic: true },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Logs de IA</h1>
      {logs.map((log) => (
        <Card key={log.id}>
          <CardHeader><CardTitle className="text-base">{log.status} / {log.model}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{log.subject.name} / {log.topic.name} / {log.difficulty} / {log.quantity} questões</p>
            <p className="text-[var(--muted-foreground)]">Admin: {log.admin.email}</p>
            {log.errorMessage && <p className="text-[var(--destructive)]">{log.errorMessage}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
