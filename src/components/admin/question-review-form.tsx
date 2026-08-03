import { Difficulty, QuestionAnswer, QuestionStatus } from "@prisma/client";
import { reviewQuestionAction } from "@/app/admin/admin-actions";
import { MathText } from "@/components/math-text";
import { SubmitButton } from "@/components/submit-button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type QuestionForReview = {
  id: string;
  updatedAt: Date;
  supportText: string | null;
  statement: string;
  answer: QuestionAnswer | null;
  difficulty: Difficulty;
  status: QuestionStatus;
  explanation: string;
  options: { id: string; label: string; text: string; isCorrect: boolean }[];
};

/**
 * Form de edição/revisão de questão, reaproveitado em /admin/questoes (busca em todo o banco)
 * e /admin/questoes/revisar (fila das pendentes) — mesma action (reviewQuestionAction), que
 * grava reviewedById e por isso já acende o selo "Revisada pela equipe" pro aluno.
 */
export function QuestionReviewForm({
  question,
  defaultStatus
}: {
  question: QuestionForReview;
  /** Fila de revisão pré-seleciona "Aprovar"; buscando/corrigindo uma questão específica, o
   *  padrão certo é preservar o status atual — senão salvar uma correção reverte sem querer
   *  uma questão já aprovada, ou aprova sem querer uma ainda em rascunho. */
  defaultStatus?: QuestionStatus;
}) {
  return (
    <form key={question.updatedAt.getTime()} action={reviewQuestionAction} className="grid gap-3">
      <input type="hidden" name="questionId" value={question.id} />
      {question.supportText != null && (
        <label className="block space-y-1 text-xs font-medium text-[var(--muted-foreground)]">
          Texto de apoio
          <Textarea name="supportText" defaultValue={question.supportText} rows={4} />
        </label>
      )}
      <Textarea name="statement" defaultValue={question.statement} />
      {question.options.length > 0 && (
        <div className="rounded-md border border-[var(--border)] p-3">
          {question.options.map((option) => (
            <p key={option.id} className={option.isCorrect ? "text-sm font-semibold text-[var(--success)]" : "text-sm"}>
              {option.label}) <MathText text={option.text} />
            </p>
          ))}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <Select name="answer" defaultValue={question.answer ?? ""}>
          <option value="">Alternativas</option>
          <option value="CERTO">CERTO</option>
          <option value="ERRADO">ERRADO</option>
        </Select>
        <Select name="difficulty" defaultValue={question.difficulty}>
          <option value="FACIL">Fácil</option>
          <option value="MEDIO">Médio</option>
          <option value="DIFICIL">Difícil</option>
        </Select>
        <Select name="status" defaultValue={defaultStatus ?? question.status}>
          <option value="DRAFT">Rascunho</option>
          <option value="PENDING_REVIEW">Pendente</option>
          <option value="APPROVED">Aprovar (revisada)</option>
          <option value="REJECTED">Rejeitar</option>
        </Select>
      </div>
      <Textarea name="explanation" defaultValue={question.explanation} />
      <SubmitButton>Salvar revisão</SubmitButton>
    </form>
  );
}
