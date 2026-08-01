"use client";

import Link from "next/link";
import { Bot, Play } from "lucide-react";
import { useActionState, useState } from "react";
import { generateUserQuestionsAction } from "@/app/(app)/actions/question-actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type SubjectWithTopics = {
  id: string;
  name: string;
  topics: { id: string; name: string }[];
};

const QUANTITY_OPTIONS = [3, 5, 10, 15, 20, 30, 40, 50];

/** Texto do corte na voz do motivo certo — culpar o "plano gratuito" mente para o assinante. */
function capReasonText(cap: { applied: number; reason: string | null }) {
  switch (cap.reason) {
    case "COTA_DIARIA":
      return `sua cota de questões de hoje só permitia ${cap.applied}`;
    case "COTA_MENSAL":
      return `sua cota de questões deste ciclo só permitia ${cap.applied}`;
    case "TAMANHO_DO_BLOCO":
      return `seu plano gera até ${cap.applied} questões por bloco`;
    case "TETO_DO_PRODUTO":
      return `${cap.applied} é o máximo por bloco`;
    default:
      return `o plano gratuito gera até ${cap.applied} por bloco`;
  }
}

export function UserGenerateForm({
  subjects,
  maxQuantity,
  capReason
}: {
  subjects: SubjectWithTopics[];
  /** Maior bloco que este usuário pode gerar agora; null = sem teto. */
  maxQuantity?: number | null;
  /** Por que está limitado — muda o texto e o destino do convite. */
  capReason?: string | null;
}) {
  const [state, formAction] = useActionState(generateUserQuestionsAction, null);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  // Assuntos em cascata: só os da matéria escolhida.
  const topics = subjects.find((subject) => subject.id === subjectId)?.topics ?? [];
  const studyHref = state?.questionSetId
    ? `/biblioteca?setId=${state.questionSetId}`
    : "";
  // O teto some do seletor em vez de ser recusado depois do envio: escolher 15 e receber 5
  // seria pior do que só não ver a opção. O servidor corta de novo, de todo jeito.
  const quantityOptions = maxQuantity
    ? [...QUANTITY_OPTIONS.filter((value) => value < maxQuantity), maxQuantity]
    : QUANTITY_OPTIONS;
  const defaultQuantity = String(quantityOptions.includes(5) ? 5 : quantityOptions[quantityOptions.length - 1]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Gerar meu bloco de questões
        </CardTitle>
        <CardDescription>
          As questões ficam privadas para você responder. Elas não aparecem para outros alunos sem revisão administrativa.
          {maxQuantity ? (
            <>
              {" "}
              Agora você pode gerar blocos de até <strong>{maxQuantity} questões</strong> —{" "}
              {capReason === "COTA_DIARIA" || capReason === "COTA_MENSAL" ? (
                "é o que resta da sua cota."
              ) : (
                <>
                  <Link href="/assinatura" className="underline">
                    {capReason === "TAMANHO_DO_BLOCO" ? "faça upgrade" : "assine um plano"}
                  </Link>{" "}
                  para gerar blocos maiores.
                </>
              )}
            </>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-4">
            <Select name="subjectId" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </Select>
            {/* key remonta o select ao trocar a matéria, voltando ao primeiro assunto dela */}
            <Select name="topicId" key={subjectId} required>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </Select>
            <Select name="difficulty" defaultValue="MEDIO">
              <option value="FACIL">Fácil</option>
              <option value="MEDIO">Médio</option>
              <option value="DIFICIL">Difícil</option>
            </Select>
            <Select name="quantity" defaultValue={defaultQuantity}>
              {quantityOptions.map((value) => (
                <option key={value} value={value}>
                  {value} questões
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Select name="format" defaultValue="CERTO_ERRADO">
              <option value="CERTO_ERRADO">Certo/Errado</option>
              <option value="MULTIPLA_ESCOLHA">Múltipla escolha</option>
            </Select>
            <Select name="alternativesCount" defaultValue="4">
              {[2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>{value} alternativas</option>
              ))}
            </Select>
            <Select name="mode" defaultValue="ESTUDO">
              <option value="ESTUDO">Estudo</option>
              <option value="SIMULADO">Simulado</option>
              <option value="REVISAO">Revisão</option>
            </Select>
          </div>
          <Textarea
            name="prompt"
            placeholder="Ex.: focar em crase; usar questões sobre Windows; considerar Constituição Estadual; evitar cálculo longo"
          />
          <label className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2.5 text-sm font-medium">
            <input type="checkbox" name="closeVariant" className="h-4 w-4" />
            Basear-se em provas reais (variações bem próximas das questões do acervo)
          </label>
          {state?.error && <p className="rounded-md bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-soft-foreground)]">{state.error}</p>}
          {state?.ok && state.quantityCap && (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              Você pediu {state.quantityCap.requested} questões, mas {capReasonText(state.quantityCap)} — foi esse o
              tamanho gerado.{" "}
              {state.quantityCap.reason === "COTA_DIARIA" ? (
                "A cota diária renova amanhã."
              ) : (
                <>
                  <Link href="/assinatura" className="font-semibold underline">
                    {state.quantityCap.reason === "PLANO_GRATUITO" ? "Assine um plano" : "Faça upgrade"}
                  </Link>{" "}
                  para gerar blocos maiores.
                </>
              )}
            </p>
          )}
          {state?.ok && state.closeVariantFallback && (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              Ainda não há questões reais cadastradas para esse assunto — geramos no modo padrão (inspirado no estilo da banca).
            </p>
          )}
          {state?.ok && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-[var(--success-soft)] p-3 text-sm text-[var(--success-soft-foreground)]">
              <span>Questões geradas. Você já pode responder o bloco.</span>
              <Button asChild size="sm">
                <Link href={studyHref}>
                  <Play className="h-4 w-4" />
                  Responder agora
                </Link>
              </Button>
            </div>
          )}
          <SubmitButton>Gerar com IA</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
