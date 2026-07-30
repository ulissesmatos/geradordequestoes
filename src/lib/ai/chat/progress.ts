/**
 * Texto de progresso mostrado enquanto o turno roda ("Gerando 20 questões de Direito
 * Constitucional…" em vez de "Trabalhando nisso…").
 *
 * Regra que vale para tudo aqui: só descrevemos trabalho que está REALMENTE acontecendo,
 * usando os argumentos que a própria ferramenta recebeu. Nada de passo de raciocínio
 * inventado nem barra de progresso por questão — o modelo devolve o lote inteiro numa única
 * resposta, então "questão 7 de 20" seria ficção.
 *
 * Roda no servidor, junto do runner, porque é lá que os argumentos da ferramenta existem;
 * o cliente recebe a frase pronta.
 */

/** Corta rótulo longo para não estourar a linha do indicador. */
function short(value: string, max = 60) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/**
 * Junta as reticências: um termo truncado já termina em "…" e as frases também terminam em "…",
 * o que produzia "……" na tela.
 */
function normalize(label: string) {
  return label.replace(/…{2,}/g, "…");
}

function parseArgs(argumentsJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argumentsJson || "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** "Direito Constitucional · Princípios" a partir do que a IA pediu de verdade. */
function subjectPath(args: Record<string, unknown>): string | null {
  const subject = text(args.subjectName);
  const topic = text(args.topicName);
  if (subject && topic) return `${subject} · ${topic}`;
  return subject ?? topic;
}

/**
 * Frase de progresso para uma ferramenta prestes a executar. `argumentsJson` é o mesmo
 * payload que vai para o executor, então o que aparece na tela é exatamente o que está
 * sendo feito.
 */
export function describeToolStart(name: string, argumentsJson: string): string {
  return normalize(buildLabel(name, parseArgs(argumentsJson)));
}

function buildLabel(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "generate_questions": {
      const quantity = typeof args.quantity === "number" ? args.quantity : null;
      const path = subjectPath(args);
      const count = quantity ? `${quantity} ${quantity === 1 ? "questão" : "questões"}` : "as questões";
      return path ? `Gerando ${count} de ${short(path)}…` : `Gerando ${count}…`;
    }
    case "generate_review_from_mistakes": {
      const subject = text(args.subjectName);
      return subject ? `Montando revisão dos seus erros em ${short(subject)}…` : "Montando revisão dos seus erros…";
    }
    case "generate_study_material": {
      const topic = text(args.topic);
      return topic ? `Escrevendo material sobre ${short(topic)}…` : "Escrevendo o material de estudo…";
    }
    case "search_reference_material": {
      const document = text(args.documentTitle);
      if (document) return `Consultando "${short(document, 40)}"…`;
      const query = text(args.query);
      return query ? `Consultando provas e materiais cadastrados: ${short(query, 45)}…` : "Consultando provas e materiais cadastrados…";
    }
    case "web_search": {
      const query = text(args.query);
      return query ? `Buscando na web: ${short(query, 50)}…` : "Buscando informações atualizadas na web…";
    }
    case "get_performance": {
      const subject = text(args.subjectName);
      return subject ? `Analisando seu desempenho em ${short(subject)}…` : "Analisando seu desempenho…";
    }
    case "get_study_history": {
      const kind = text(args.kind);
      if (kind === "most_missed") return "Levantando o que você mais errou…";
      if (kind === "recent_correct") return "Levantando seus acertos recentes…";
      if (kind === "favorites") return "Buscando suas questões favoritas…";
      return "Consultando seu histórico de estudo…";
    }
    case "get_question_set_results":
      return "Buscando o resultado do seu último bloco…";
    case "ask_clarifying_question":
      return "Preparando uma pergunta…";
    default:
      return "Trabalhando nisso…";
  }
}
