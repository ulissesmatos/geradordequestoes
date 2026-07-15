"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { updateStudyPreferencesAction, type ProfileActionState } from "@/app/(app)/perfil/actions";
import { Button } from "@/components/ui/button";
import { BR_STATES } from "@/lib/br-states";
import { cn } from "@/lib/utils";

const SUGGESTED_UF = "MA";

// MA primeiro (público inicial do cursinho), demais em ordem alfabética.
const ORDERED_STATES = [
  ...BR_STATES.filter((state) => state.uf === SUGGESTED_UF),
  ...BR_STATES.filter((state) => state.uf !== SUGGESTED_UF)
];

export function StudyPreferencesForm({ selected }: { selected: string[] }) {
  const [state, formAction, pending] = useActionState<ProfileActionState, FormData>(updateStudyPreferencesAction, null);
  const [chosen, setChosen] = useState<Set<string>>(new Set(selected));

  function toggle(uf: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(uf)) next.delete(uf);
      else next.add(uf);
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {ORDERED_STATES.map(({ uf, name }) => {
          const active = chosen.has(uf);
          return (
            <button
              key={uf}
              type="button"
              onClick={() => toggle(uf)}
              aria-pressed={active}
              title={name}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--foreground)]"
              )}
            >
              {uf}
              {uf === SUGGESTED_UF && !active && (
                <span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-px text-[10px] font-semibold text-[var(--accent-foreground)]">
                  sugestão
                </span>
              )}
            </button>
          );
        })}
      </div>

      {[...chosen].map((uf) => (
        <input key={uf} type="hidden" name="states" value={uf} />
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Salvando..." : "Salvar preferências"}
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
