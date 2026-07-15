"use client";

import { useState } from "react";
import { createQuestionAction } from "@/app/admin/admin-actions";
import { SubmitButton } from "@/components/submit-button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type SubjectWithTopics = {
  id: string;
  name: string;
  topics: { id: string; name: string }[];
};

export function ManualQuestionForm({ subjects }: { subjects: SubjectWithTopics[] }) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  // Assuntos em cascata: só os da matéria escolhida.
  const topics = subjects.find((subject) => subject.id === subjectId)?.topics ?? [];

  return (
    <form action={createQuestionAction} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-4">
        <Select name="subjectId" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>{subject.name}</option>
          ))}
        </Select>
        {/* key remonta o select ao trocar a matéria, voltando ao primeiro assunto dela */}
        <Select name="topicId" key={subjectId} required>
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>{topic.name}</option>
          ))}
        </Select>
        <Select name="difficulty" defaultValue="MEDIO">
          <option value="FACIL">Fácil</option>
          <option value="MEDIO">Médio</option>
          <option value="DIFICIL">Difícil</option>
        </Select>
        <Select name="status" defaultValue="PENDING_REVIEW">
          <option value="DRAFT">Rascunho</option>
          <option value="PENDING_REVIEW">Pendente</option>
          <option value="APPROVED">Aprovada</option>
          <option value="REJECTED">Rejeitada</option>
        </Select>
      </div>
      <Textarea name="statement" placeholder="Enunciado" required />
      <Select name="answer" defaultValue="CERTO">
        <option value="CERTO">CERTO</option>
        <option value="ERRADO">ERRADO</option>
      </Select>
      <Textarea name="explanation" placeholder="Justificativa" required />
      <SubmitButton>Criar questão</SubmitButton>
    </form>
  );
}
