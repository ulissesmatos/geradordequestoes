"use client";

import { useActionState, useState } from "react";
import { generateQuestionsAction } from "@/app/admin/admin-actions";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type SubjectWithTopics = {
  id: string;
  name: string;
  topics: { id: string; name: string }[];
};

export function GenerateForm({ subjects }: { subjects: SubjectWithTopics[] }) {
  const [state, formAction] = useActionState(generateQuestionsAction, null);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  // Assuntos em cascata: só os da matéria escolhida.
  const topics = subjects.find((subject) => subject.id === subjectId)?.topics ?? [];

  return (
    <Card>
      <CardHeader><CardTitle>Gerar questões por IA</CardTitle></CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-4">
            <Select name="subjectId" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</Select>
            <Select name="topicId" key={subjectId} required>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</Select>
            <Select name="difficulty" defaultValue="MEDIO"><option value="FACIL">Fácil</option><option value="MEDIO">Médio</option><option value="DIFICIL">Difícil</option></Select>
            <Select name="quantity" defaultValue="5">{[3, 5, 10, 15, 20].map((value) => <option key={value} value={value}>{value} questões</option>)}</Select>
          </div>
          <Textarea name="extraInstructions" placeholder="Instruções adicionais, conteúdo base, estado, lei ou recorte específico" />
          {state?.ok && <p className="rounded-md bg-green-50 p-3 text-sm text-green-700">Questões geradas como pendentes de revisão.</p>}
          {state?.error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
          <SubmitButton>Gerar questões</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
