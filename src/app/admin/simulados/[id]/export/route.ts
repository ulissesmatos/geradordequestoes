import { requireAdmin } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  if (/[;"\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const exam = await prisma.mockExam.findUnique({
    where: { id },
    select: {
      title: true,
      // Mesmo filtro do ranking em admin/simulados/[id]/page.tsx: só a tentativa oficial de
      // cada aluno (isPractice: false) — senão quem repetiu em modo prática duplicaria linha.
      sessions: {
        where: { finishedAt: { not: null }, isPractice: false },
        include: { user: { select: { name: true, email: true } } },
        orderBy: [{ netScore: "desc" }, { totalSeconds: "asc" }]
      }
    }
  });
  if (!exam) return new Response("Simulado não encontrado.", { status: 404 });

  const header = ["posicao", "nome", "email", "nota_liquida", "certas", "erradas", "brancos", "tempo_segundos", "finalizado_em"];
  const rows = exam.sessions.map((session, i) =>
    [
      i + 1,
      csvCell(session.user.name),
      csvCell(session.user.email),
      session.netScore,
      session.correctCount,
      session.wrongCount,
      session.blankCount,
      session.totalSeconds,
      session.finishedAt?.toISOString() ?? ""
    ].join(";")
  );

  // BOM para o Excel abrir acentos corretamente.
  const csv = "﻿" + [header.join(";"), ...rows].join("\r\n");
  const safeTitle = exam.title.replace(/[^\w\-]+/g, "_").slice(0, 60);

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="resultados-${safeTitle}.csv"`
    }
  });
}
