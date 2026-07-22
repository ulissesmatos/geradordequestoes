"use client";

import { useActionState, useState } from "react";
import { createMockExamAction, type MockExamActionState } from "@/app/admin/simulados/actions";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ModelOption } from "@/lib/ai/model-catalog";

type SubjectWithTopics = { id: string; name: string; topics: { id: string; name: string }[] };

const CUSTOM_MODEL = "__custom__";

export function MockExamCreateForm({
  subjects,
  teams,
  providerName,
  defaultModel,
  modelOptions
}: {
  subjects: SubjectWithTopics[];
  teams: { id: string; name: string }[];
  providerName: string;
  defaultModel: string;
  modelOptions: ModelOption[];
}) {
  const [state, formAction] = useActionState<MockExamActionState, FormData>(createMockExamAction, null);
  const [modelChoice, setModelChoice] = useState("");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  // Assuntos em cascata: só os da matéria escolhida.
  const topics = subjects.find((subject) => subject.id === subjectId)?.topics ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados do simulado</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="title">Título</label>
              <Input id="title" name="title" placeholder="Ex.: Simulado PC-MA — Direito Constitucional" required />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="teamAccountId">Disponível para</label>
              <Select id="teamAccountId" name="teamAccountId" defaultValue="">
                <option value="">Todos os assinantes</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>Apenas: {team.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="description">Descrição (opcional)</label>
            <Textarea id="description" name="description" placeholder="Instruções exibidas na capa do simulado para os alunos" rows={2} />
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="subjectId">Matéria</label>
              <Select id="subjectId" name="subjectId" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="topicId">Assunto</label>
              {/* key remonta o select ao trocar a matéria, voltando ao primeiro assunto dela */}
              <Select id="topicId" name="topicId" key={subjectId} required>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>{topic.name}</option>
                ))}
              </Select>
              {topics.length <= 1 && (
                <p className="text-xs text-[var(--muted-foreground)]">
                  Cadastre mais assuntos desta matéria em Admin → Matérias e assuntos.
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="difficulty">Dificuldade</label>
              <Select id="difficulty" name="difficulty" defaultValue="MEDIO">
                <option value="FACIL">Fácil</option>
                <option value="MEDIO">Médio</option>
                <option value="DIFICIL">Difícil</option>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="quantity">Questões</label>
              <Select id="quantity" name="quantity" defaultValue="20">
                {[5, 10, 20, 30, 50, 80, 120].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="durationMinutes">Duração (minutos)</label>
              <Input id="durationMinutes" name="durationMinutes" type="number" min={5} max={360} defaultValue={60} required />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="opensAt">Abre em (opcional)</label>
              <Input id="opensAt" name="opensAt" type="datetime-local" />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="closesAt">Fecha em (opcional)</label>
              <Input id="closesAt" name="closesAt" type="datetime-local" />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="modelChoice">
                Modelo de IA <span className="font-normal text-[var(--muted-foreground)]">(provedor: {providerName})</span>
              </label>
              <Select id="modelChoice" value={modelChoice} onChange={(e) => setModelChoice(e.target.value)}>
                <option value="">Padrão configurado ({defaultModel})</option>
                {modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
                <option value={CUSTOM_MODEL}>Outro (digitar ID do modelo)</option>
              </Select>
              {modelChoice !== CUSTOM_MODEL && <input type="hidden" name="model" value={modelChoice} />}
            </div>
            {modelChoice === CUSTOM_MODEL && (
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="customModel">ID do modelo</label>
                <Input
                  id="customModel"
                  name="model"
                  placeholder={providerName === "OpenRouter" ? "ex.: provedor/modelo" : "ex.: id do modelo"}
                  required
                />
              </div>
            )}
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="prompt">Instruções para a IA (opcional)</label>
            <Textarea
              id="prompt"
              name="prompt"
              placeholder="Recorte específico, legislação, edital de referência, estilo de pegadinha..."
              rows={2}
            />
          </div>

          <label className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2.5 text-sm font-medium">
            <input type="checkbox" name="closeVariant" className="h-4 w-4" />
            Basear-se em provas reais (variação fiel: uma questão nova bem próxima de cada questão real do acervo, em vez de só imitar o estilo)
          </label>

          {state?.error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}

          <SubmitButton>Gerar simulado (rascunho)</SubmitButton>
          <p className="text-xs text-[var(--muted-foreground)]">
            A geração pode levar até um minuto. O simulado é criado como rascunho para você revisar as questões e o
            gabarito antes de publicar.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
