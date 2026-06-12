"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteStudyMaterialAction } from "@/app/(app)/actions/material-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogPanel } from "@/components/ui/dialog";

export function DeleteMaterialButton({ materialId }: { materialId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await deleteStudyMaterialAction(materialId);
      router.push("/materiais");
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
        Excluir
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogPanel>
          <DialogHeader
            title="Excluir material"
            description="Esta ação não pode ser desfeita. O material será permanentemente removido."
            onClose={() => setOpen(false)}
          />
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>
              {isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </div>
        </DialogPanel>
      </Dialog>
    </>
  );
}
