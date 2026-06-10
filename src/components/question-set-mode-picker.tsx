"use client";

import Link from "next/link";
import { Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function QuestionSetModePicker({ setId }: { setId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bloco já concluído</CardTitle>
        <CardDescription>Você respondeu todas as questões deste bloco. O que deseja fazer?</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href={`/biblioteca?setId=${setId}&mode=review`}>
            <Eye className="h-4 w-4" />
            Revisar respostas anteriores
          </Link>
        </Button>
        <Button asChild>
          <Link href={`/biblioteca?setId=${setId}&mode=retry`}>
            <RotateCcw className="h-4 w-4" />
            Responder novamente
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
