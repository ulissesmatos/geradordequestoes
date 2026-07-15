"use client";

import Link from "next/link";
import { Play, Sparkles } from "lucide-react";
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

export function ModeGenerateForm({
  subjects,
  mode,
  title,
  description,
  promptPlaceholder,
  context
}: {
  subjects: SubjectWithTopics[];
  mode: "ESTUDO" | "SIMULADO" | "REVISAO";
  title: string;
  description: string;
  promptPlaceholder: string;
  context?: string;
}) {
  const [state, formAction] = useActionState(generateUserQuestionsAction, null);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  // Assuntos em cascata: só os da matéria escolhida.
  const topics = subjects.find((subject) => subject.id === subjectId)?.topics ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="mode" value={mode} />
          {context && <input type="hidden" name="context" value={context} />}
          <Textarea name="prompt" placeholder={promptPlaceholder} required />
          <div className="grid gap-3 md:grid-cols-3">
            <Select name="subjectId" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </Select>
            {/* key remonta o select ao trocar a matéria, voltando ao primeiro assunto dela */}
            <Select name="topicId" key={subjectId} required>
              {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
            </Select>
            <Select name="difficulty" defaultValue="MEDIO">
              <option value="FACIL">Fácil</option>
              <option value="MEDIO">Médio</option>
              <option value="DIFICIL">Difícil</option>
            </Select>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Select name="format" defaultValue={mode === "SIMULADO" ? "MULTIPLA_ESCOLHA" : "CERTO_ERRADO"}>
              <option value="CERTO_ERRADO">Certo/Errado</option>
              <option value="MULTIPLA_ESCOLHA">Múltipla escolha</option>
            </Select>
            <Select name="alternativesCount" defaultValue="4">
              {[2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} alternativas</option>)}
            </Select>
            <Select name="quantity" defaultValue={mode === "SIMULADO" ? "10" : "5"}>
              {[3, 5, 10, 15].map((value) => <option key={value} value={value}>{value} questões</option>)}
            </Select>
          </div>
          {state?.error && <p className="rounded-md bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-soft-foreground)]">{state.error}</p>}
          {state?.ok && state.questionSetId && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-[var(--success-soft)] p-3 text-sm text-[var(--success-soft-foreground)]">
              <span>Bloco gerado e salvo.</span>
              <Button asChild size="sm">
                <Link href={`/biblioteca?setId=${state.questionSetId}`}>
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
