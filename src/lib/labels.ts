import { Difficulty, QuestionFormat, QuestionSetMode } from "@prisma/client";

export function questionSetModeLabel(mode: QuestionSetMode) {
  return {
    [QuestionSetMode.ESTUDO]: "Estudo",
    [QuestionSetMode.SIMULADO]: "Simulado",
    [QuestionSetMode.REVISAO]: "Revisão"
  }[mode];
}

export function questionFormatLabel(format: QuestionFormat) {
  return {
    [QuestionFormat.CERTO_ERRADO]: "Certo/Errado",
    [QuestionFormat.MULTIPLA_ESCOLHA]: "Múltipla escolha"
  }[format];
}

export function difficultyLabel(difficulty: Difficulty) {
  return {
    [Difficulty.FACIL]: "Fácil",
    [Difficulty.MEDIO]: "Médio",
    [Difficulty.DIFICIL]: "Difícil"
  }[difficulty];
}
