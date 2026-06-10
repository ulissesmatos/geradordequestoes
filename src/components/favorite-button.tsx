"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toggleFavoriteByIdAction } from "@/app/(app)/actions/question-actions";
import { Button } from "@/components/ui/button";

export function FavoriteButton({ questionId, initialFavorited }: { questionId: string; initialFavorited: boolean }) {
  const [isFav, setIsFav] = useState(initialFavorited);
  const [, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    setIsFav((prev) => !prev);
    startTransition(async () => {
      await toggleFavoriteByIdAction(questionId);
    });
  }

  return (
    <Button variant="ghost" size="icon" title={isFav ? "Remover dos favoritos" : "Favoritar"} onClick={handleClick}>
      <Heart className={`h-5 w-5 transition-colors ${isFav ? "fill-rose-500 text-rose-500" : "text-[var(--muted-foreground)]"}`} />
    </Button>
  );
}
