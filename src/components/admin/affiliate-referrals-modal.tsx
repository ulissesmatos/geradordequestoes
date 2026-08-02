"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogPanel } from "@/components/ui/dialog";
import { formatDateBR } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type AffiliateReferralRow = {
  userId: string;
  name: string;
  email: string;
  /** ISO string — serializado no servidor. */
  joinedAt: string;
  hasPaid: boolean;
  totalPaidCents: number;
  commissionEarnedCents: number;
};

/** Botão "Ver indicados" que abre um modal com a lista de quem se cadastrou pelo link do afiliado. */
export function AffiliateReferralsButton({
  affiliateName,
  referrals
}: {
  affiliateName: string;
  referrals: AffiliateReferralRow[];
}) {
  const [open, setOpen] = useState(false);
  const paidCount = referrals.filter((referral) => referral.hasPaid).length;

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen(true)}>
        <Users className="h-3.5 w-3.5" />
        Ver indicados
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogPanel className="max-w-lg">
          <DialogHeader
            title={`Indicados de ${affiliateName}`}
            description={`${referrals.length} cadastrados · ${paidCount} pagantes`}
            onClose={() => setOpen(false)}
          />
          <div className="max-h-[60vh] space-y-2 overflow-y-auto px-6 py-4">
            {referrals.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">Ninguém se cadastrou por este link ainda.</p>
            ) : (
              referrals.map((referral) => (
                <div key={referral.userId} className="rounded-md border border-[var(--border)] p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{referral.name}</p>
                      <p className="truncate text-xs text-[var(--muted-foreground)]">{referral.email}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                        referral.hasPaid ? "bg-emerald-100 text-emerald-800" : "bg-[var(--muted)] text-[var(--muted-foreground)]"
                      )}
                    >
                      {referral.hasPaid ? "Pagou" : "Não pagou"}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">
                    Cadastrado em {formatDate(referral.joinedAt)}
                    {referral.hasPaid &&
                      ` · pagou ${formatMoney(referral.totalPaidCents)} · comissão gerada ${formatMoney(referral.commissionEarnedCents)}`}
                  </p>
                </div>
              ))
            )}
          </div>
          <div className="flex justify-end px-6 py-4">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Fechar
            </Button>
          </div>
        </DialogPanel>
      </Dialog>
    </>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(iso: string) {
  return formatDateBR(iso, "medium");
}
