"use client";

import { useEffect, useRef, useState } from "react";
import { recordPopupClickedAction, recordPopupDismissedAction, recordPopupShownAction } from "@/app/actions";
import { PopupModalContent } from "@/components/popup-modal-content";
import { Dialog, DialogPanel } from "@/components/ui/dialog";
import type { PopupPayload } from "@/lib/popups";

/** Delay antes de abrir: evita o popup "explodir" instantaneamente no load da página. */
const OPEN_DELAY_MS = 500;

export function PopupManager({ popup }: { popup: PopupPayload | null }) {
  const [open, setOpen] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    if (!popup) return;
    const timer = setTimeout(() => {
      setOpen(true);
      if (!shownRef.current) {
        shownRef.current = true;
        void recordPopupShownAction(popup.id);
      }
    }, OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [popup]);

  if (!popup) return null;

  const handleDismiss = () => {
    setOpen(false);
    void recordPopupDismissedAction(popup.id);
  };

  const handleCtaClick = () => {
    void recordPopupClickedAction(popup.id);
  };

  return (
    <Dialog open={open} onClose={handleDismiss}>
      <DialogPanel className="max-w-md overflow-hidden">
        <PopupModalContent popup={popup} onDismiss={handleDismiss} onCtaClick={handleCtaClick} />
      </DialogPanel>
    </Dialog>
  );
}
