"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { updateNotificationPrefsAction, type ProfileActionState } from "@/app/(app)/perfil/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NotificationPreferencesForm({
  reviewReminderEnabled,
  weeklySummaryEnabled,
  dailyQuestionGoal
}: {
  reviewReminderEnabled: boolean;
  weeklySummaryEnabled: boolean;
  dailyQuestionGoal: number | null;
}) {
  const [state, formAction, pending] = useActionState<ProfileActionState, FormData>(
    updateNotificationPrefsAction,
    null
  );

  return (
    <form action={formAction} className="space-y-4">
      <label className="grid max-w-xs gap-1 text-sm">
        <span className="font-medium">Meta diária de questões</span>
        <Input
          name="dailyQuestionGoal"
          type="number"
          min={1}
          max={500}
          defaultValue={dailyQuestionGoal ?? ""}
          placeholder="Ex.: 10 (em branco = sem meta)"
        />
        <span className="text-xs text-[var(--muted-foreground)]">
          Acompanhe o progresso da meta na página Desempenho.
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="reviewReminder" defaultChecked={reviewReminderEnabled} className="mt-0.5 h-4 w-4" />
        <span>
          <span className="font-medium">Lembrete diário de revisão por e-mail</span>
          <span className="block text-xs text-[var(--muted-foreground)]">
            Um e-mail por dia, apenas quando houver questões vencidas na sua agenda de revisão.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="weeklySummary" defaultChecked={weeklySummaryEnabled} className="mt-0.5 h-4 w-4" />
        <span>
          <span className="font-medium">Resumo semanal por e-mail</span>
          <span className="block text-xs text-[var(--muted-foreground)]">
            Toda segunda: questões respondidas, % de acerto, sequência de dias e revisões pendentes.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Salvando..." : "Salvar preferências de estudo"}
        </Button>
        {state?.ok && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 animate-fade-in">
            <CheckCircle2 className="h-4 w-4" />
            Preferências salvas
          </span>
        )}
        {state?.error && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--destructive)]">
            <AlertTriangle className="h-4 w-4" />
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
