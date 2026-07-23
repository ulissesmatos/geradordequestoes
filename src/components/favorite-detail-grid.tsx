"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { FavoriteButton } from "@/components/favorite-button";
import { MathText } from "@/components/math-text";

type FavoriteItem = {
  id: string;
  question: {
    id: string;
    statement: string;
    answer?: string | null;
    explanation: string;
    subject: { name: string };
    topic: { name: string };
    options?: { label: string; text: string; isCorrect: boolean; order: number }[];
  };
};

export function FavoriteDetailGrid({ favorites }: { favorites: FavoriteItem[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (favorites.length === 0) {
    return <p className="text-sm text-[var(--muted-foreground)]">Nenhuma favorita ainda.</p>;
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {favorites.map((fav) => {
        const isOpen = expanded.has(fav.id);
        const correct = fav.question.options?.find((o) => o.isCorrect);
        const correctText = correct ? `${correct.label}) ${correct.text}` : fav.question.answer ?? "—";

        return (
          <div key={fav.id} className="flex flex-col rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
            <button
              type="button"
              onClick={() => toggle(fav.id)}
              className="flex items-start justify-between gap-2 p-4 text-left"
            >
              <div className="flex-1">
                <p className="line-clamp-3 text-sm"><MathText text={fav.question.statement} /></p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {fav.question.subject.name} / {fav.question.topic.name}
                </p>
              </div>
              <div className="mt-0.5 shrink-0 text-[var(--muted-foreground)]">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-[var(--border)] px-4 pb-4 pt-3 space-y-3">
                {fav.question.options && fav.question.options.length > 0 ? (
                  <div className="space-y-1">
                    {fav.question.options
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((opt) => (
                        <p
                          key={opt.label}
                          className={`text-sm rounded px-2 py-1 ${opt.isCorrect ? "bg-emerald-50 font-semibold text-emerald-800 border border-emerald-200" : "text-[var(--foreground)]"}`}
                        >
                          <span className="font-bold">{opt.label})</span> <MathText text={opt.text} />
                          {opt.isCorrect && <span className="ml-2 text-xs">✓ correto</span>}
                        </p>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-emerald-800">Gabarito: {correctText}</p>
                )}
                <p className="text-xs text-[var(--muted-foreground)] leading-5"><MathText text={fav.question.explanation} /></p>
                <div className="flex justify-end">
                  <FavoriteButton questionId={fav.question.id} initialFavorited={true} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
