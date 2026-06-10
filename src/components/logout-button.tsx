"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { cn } from "@/lib/utils";

/**
 * Invoca o logout direto no onClick em vez de <form action>: dentro de menus
 * que fecham ao clicar, o form era desmontado antes do submit disparar e o
 * logout nunca acontecia.
 */
export function LogoutButton({ className }: { className?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={(event) => {
        // Impede o fechamento do menu de desmontar o botão antes da action rodar.
        event.stopPropagation();
        startTransition(async () => {
          await logoutAction();
        });
      }}
      className={cn("inline-flex items-center gap-2", className, pending && "cursor-wait opacity-70")}
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      Sair
    </button>
  );
}
