import { z } from "zod";

export const chatTools = {
  generate_questions: {
    description:
      "Gera e salva um bloco de questões originais de concurso para o usuário responder dentro do app. Use sempre que o usuário pedir questões, itens, exercícios, simulado ou prova. O bloco fica salvo na biblioteca e o app mostra o botão de responder automaticamente.",
    schema: z.object({
      subjectName: z.string().describe("Nome da matéria, ex.: Português. Use uma matéria da lista de matérias cadastradas."),
      topicName: z.string().optional().describe("Assunto dentro da matéria, se o usuário citar (ex.: Crase)."),
      quantity: z.number().int().min(1).max(15).default(5).describe("Quantidade de questões (1 a 15)."),
      difficulty: z.enum(["FACIL", "MEDIO", "DIFICIL"]).default("MEDIO"),
      format: z.enum(["CERTO_ERRADO", "MULTIPLA_ESCOLHA"]).default("CERTO_ERRADO").describe("Certo/Errado é o padrão do Cebraspe."),
      alternativesCount: z.number().int().min(2).max(5).optional().describe("Número de alternativas quando o formato é múltipla escolha."),
      mode: z.enum(["ESTUDO", "SIMULADO", "REVISAO"]).default("ESTUDO").describe("SIMULADO quando o usuário pedir simulado ou prova; ESTUDO para pedidos comuns.")
    })
  },
  generate_study_material: {
    description:
      "Gera e salva um material de estudo em texto (resumo, apostila curta, guia teórico) na área de Materiais do usuário. Use quando o usuário pedir material, resumo, apostila, teoria ou conteúdo para ler.",
    schema: z.object({
      topic: z.string().describe("Tema do material, ex.: 'Crase em Português' ou 'Atos administrativos'."),
      focus: z.string().optional().describe("Direção extra, ex.: 'focado nos erros recentes do aluno' ou 'nível iniciante'.")
    })
  },
  get_performance: {
    description:
      "Consulta o desempenho real do usuário no app (percentual de acertos, ranking de matérias). Use quando o usuário perguntar como está indo, qual a pior matéria ou o desempenho em uma matéria específica.",
    schema: z.object({
      scope: z.enum(["overall", "subject", "worst_subject"]).describe("overall = desempenho geral; subject = em uma matéria específica; worst_subject = pior matéria."),
      subjectName: z.string().optional().describe("Obrigatório quando scope = subject.")
    })
  },
  get_study_history: {
    description:
      "Consulta o histórico real do usuário: questões mais erradas, últimos acertos ou questões favoritas. Use quando o usuário perguntar o que mais errou, o que acertou ou pedir as favoritas.",
    schema: z.object({
      kind: z.enum(["most_missed", "recent_correct", "favorites"]),
      subjectName: z.string().optional().describe("Filtra por matéria, se o usuário citar.")
    })
  },
  generate_review_from_mistakes: {
    description:
      "Gera e salva um bloco de revisão personalizado baseado nos erros recentes do usuário. Use quando o usuário pedir revisão dos erros, treino dos pontos fracos ou revisão personalizada.",
    schema: z.object({
      subjectName: z.string().optional().describe("Restringe a revisão a uma matéria, se o usuário citar."),
      quantity: z.number().int().min(1).max(15).optional(),
      format: z.enum(["CERTO_ERRADO", "MULTIPLA_ESCOLHA"]).optional()
    })
  }
} as const;

export type ChatToolName = keyof typeof chatTools;

export function isChatToolName(value: string): value is ChatToolName {
  return value in chatTools;
}

export type NeutralToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export function getNeutralToolSpecs(): NeutralToolSpec[] {
  return Object.entries(chatTools).map(([name, def]) => ({
    name,
    description: def.description,
    parameters: toPlainJsonSchema(def.schema)
  }));
}

function toPlainJsonSchema(schema: z.ZodType) {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7", io: "input" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}
