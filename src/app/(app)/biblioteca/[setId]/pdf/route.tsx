import React from "react";
import { Document, Page, Text, View, Image, Link, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscriptions";
import { getAppSettings } from "@/lib/app-settings";
import { appUrl } from "@/lib/payments";
import { formatDateBR } from "@/lib/dates";
import { questionFormatLabel, questionSetModeLabel } from "@/lib/labels";

export const runtime = "nodejs";

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Mesma técnica do PDF de materiais: baixa a logo do branding por HTTP e converte pra data
 *  URI, já que o bundle serverless não carrega arquivos de /public pelo filesystem. */
async function loadLogoDataUri(logoUrl: string): Promise<string | null> {
  try {
    const absoluteUrl = /^https?:\/\//i.test(logoUrl) ? logoUrl : `${appUrl()}/${logoUrl.replace(/^\/+/, "")}`;
    const res = await fetch(absoluteUrl);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/png";
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function buildStyles(primary: string, accent: string) {
  const foreground = "#131a18";
  const muted = "#5a655f";
  const border = "#dde3df";

  return StyleSheet.create({
    page: {
      paddingTop: 40,
      paddingBottom: 68,
      paddingLeft: 48,
      paddingRight: 48,
      fontSize: 11,
      fontFamily: "Helvetica",
      color: foreground
    },
    bold: { fontWeight: "bold" },

    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 18,
      paddingBottom: 10,
      borderBottomWidth: 1.5,
      borderBottomColor: primary
    },
    headerLogo: { width: 96 },
    headerAppName: { fontSize: 13, fontWeight: "bold", color: primary },
    headerBadge: { fontSize: 8, color: muted, textTransform: "uppercase", letterSpacing: 1 },

    hero: { marginBottom: 4 },
    accentBar: { width: 42, height: 4, backgroundColor: accent, borderRadius: 2, marginBottom: 14 },
    title: { fontSize: 20, fontWeight: "bold", color: foreground, lineHeight: 1.25, marginBottom: 10 },
    tagsRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
    tag: {
      backgroundColor: hexToRgba(primary, 0.08),
      borderWidth: 1,
      borderColor: hexToRgba(primary, 0.25),
      borderRadius: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
      marginRight: 8,
      marginBottom: 6
    },
    tagAccent: { backgroundColor: hexToRgba(accent, 0.12), borderColor: hexToRgba(accent, 0.35) },
    tagText: { fontSize: 9, color: primary, fontWeight: "bold" },
    tagAccentText: { color: "#7a5200" },
    generatedAt: { fontSize: 9, color: muted },
    heroDivider: { borderBottomWidth: 1, borderBottomColor: border, marginTop: 14, marginBottom: 16 },

    sectionTitle: {
      fontSize: 15,
      fontWeight: "bold",
      color: primary,
      marginTop: 4,
      marginBottom: 12,
      paddingBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: hexToRgba(primary, 0.2)
    },

    supportBox: {
      backgroundColor: "#f6f8f6",
      borderWidth: 1,
      borderColor: border,
      borderRadius: 4,
      padding: 10,
      marginBottom: 10
    },
    supportLabel: { fontSize: 8.5, fontWeight: "bold", color: muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
    supportText: { fontSize: 10, lineHeight: 1.4, color: foreground },

    questionBlock: { marginBottom: 14 },
    questionHeader: { flexDirection: "row", marginBottom: 4 },
    questionNumber: { width: 22, fontSize: 11, fontWeight: "bold", color: primary },
    questionStatement: { flex: 1, fontSize: 11, lineHeight: 1.4 },

    optionsWrap: { marginTop: 4, marginLeft: 22 },
    optionRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 3 },
    optionCircle: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: muted, marginRight: 6, marginTop: 1 },
    optionText: { flex: 1, fontSize: 10, lineHeight: 1.35 },

    boolRow: { flexDirection: "row", marginTop: 4, marginLeft: 22 },
    boolOption: { flexDirection: "row", alignItems: "center", marginRight: 24 },
    boolText: { fontSize: 10, marginLeft: 6 },

    answerKeyRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10, borderBottomWidth: 1, borderBottomColor: border, paddingBottom: 10 },
    answerKeyNumber: { width: 22, fontSize: 11, fontWeight: "bold", color: primary },
    answerKeyBody: { flex: 1 },
    answerKeyAnswer: { fontSize: 10.5, fontWeight: "bold", color: "#1f7a4d", marginBottom: 3 },
    answerKeyExplanation: { fontSize: 10, lineHeight: 1.35, color: foreground },

    footer: { position: "absolute", bottom: 28, left: 48, right: 48 },
    footerRule: { borderBottomWidth: 1, borderBottomColor: border, marginBottom: 8 },
    footerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    footerText: { fontSize: 8.5, color: muted },
    footerLink: { fontSize: 8.5, color: primary, textDecoration: "none" }
  });
}

type PdfStyles = ReturnType<typeof buildStyles>;

type OptionRow = { id: string; label: string; text: string; isCorrect: boolean };
type QuestionRow = {
  id: string;
  statement: string;
  supportText: string | null;
  format: "CERTO_ERRADO" | "MULTIPLA_ESCOLHA";
  answer: "CERTO" | "ERRADO" | null;
  explanation: string;
  options: OptionRow[];
};

function correctAnswerLabel(question: QuestionRow) {
  const correct = question.options.find((o) => o.isCorrect);
  if (correct) return `${correct.label}) ${correct.text}`;
  return question.answer === "CERTO" ? "Certo" : question.answer === "ERRADO" ? "Errado" : "—";
}

/** Agrupa questões consecutivas que compartilham o mesmo texto de apoio — no banco cada
 *  questão guarda sua própria cópia (autossuficiente para o QuestionRunner), mas repetir o
 *  mesmo parágrafo antes de cada item deixaria o PDF impresso redundante; no papel, o padrão
 *  Cebraspe é "um texto, vários itens julgados a partir dele". */
function groupBySupportText(questions: QuestionRow[]): Array<{ supportText: string | null; items: QuestionRow[] }> {
  const groups: Array<{ supportText: string | null; items: QuestionRow[] }> = [];
  for (const question of questions) {
    const last = groups[groups.length - 1];
    if (last && last.supportText === question.supportText) {
      last.items.push(question);
    } else {
      groups.push({ supportText: question.supportText, items: [question] });
    }
  }
  return groups;
}

export async function GET(_: Request, { params }: { params: Promise<{ setId: string }> }) {
  const user = await requireUser();
  await requireActiveSubscription(user);
  const { setId } = await params;

  const set = await prisma.questionSet.findFirst({
    where: {
      id: setId,
      // Mesma regra de acesso da tela do bloco: dono, OU quem participou do simulado (dono
      // técnico é o admin que gerou — ver mock-exam-generator.ts).
      OR: [{ userId: user.id }, { mockExam: { sessions: { some: { userId: user.id } } } }]
    },
    include: {
      subject: true,
      topic: true,
      questions: {
        include: { options: { orderBy: { order: "asc" } } },
        orderBy: { orderInSet: "asc" }
      }
    }
  });
  if (!set) return new Response("Bloco não encontrado.", { status: 404 });

  const appSettings = await getAppSettings();
  const s = buildStyles(appSettings.primaryColor, appSettings.accentColor);
  const logoDataUri = await loadLogoDataUri(appSettings.logoUrl);
  const siteUrl = appUrl();
  const siteHost = siteUrl.replace(/^https?:\/\//i, "");
  const questions = set.questions as unknown as QuestionRow[];
  const groups = groupBySupportText(questions);

  let counter = 0;

  const buffer = await renderToBuffer(
    <Document title={set.title} author={appSettings.appName} creator={appSettings.appName}>
      <Page size="A4" style={s.page} wrap>
        <View style={s.header} fixed>
          <Link src={siteUrl}>
            {logoDataUri ? <Image src={logoDataUri} style={s.headerLogo} /> : <Text style={s.headerAppName}>{appSettings.appName}</Text>}
          </Link>
          <Text style={s.headerBadge}>Bloco de questões</Text>
        </View>

        <View style={s.hero}>
          <View style={s.accentBar} />
          <Text style={s.title}>{set.title}</Text>
          <View style={s.tagsRow}>
            <View style={s.tag}>
              <Text style={s.tagText}>{set.subject.name}</Text>
            </View>
            <View style={[s.tag, s.tagAccent]}>
              <Text style={[s.tagText, s.tagAccentText]}>{set.topic.name}</Text>
            </View>
            <View style={s.tag}>
              <Text style={s.tagText}>{questionFormatLabel(set.format)}</Text>
            </View>
            <View style={s.tag}>
              <Text style={s.tagText}>{questionSetModeLabel(set.mode)}</Text>
            </View>
            <View style={s.tag}>
              <Text style={s.tagText}>{set.questions.length} questões</Text>
            </View>
          </View>
          <Text style={s.generatedAt}>Gerado em {formatDateBR(new Date(), "long")}</Text>
        </View>
        <View style={s.heroDivider} />

        <Text style={s.sectionTitle}>Questões</Text>
        {groups.map((group, gi) => (
          <View key={gi}>
            {group.supportText && (
              <View style={s.supportBox} wrap={false}>
                <Text style={s.supportLabel}>Texto de apoio</Text>
                <Text style={s.supportText}>{group.supportText}</Text>
              </View>
            )}
            {group.items.map((question) => {
              counter += 1;
              return (
                <View key={question.id} style={s.questionBlock} wrap={false}>
                  <View style={s.questionHeader}>
                    <Text style={s.questionNumber}>{counter}.</Text>
                    <Text style={s.questionStatement}>{question.statement}</Text>
                  </View>
                  {question.format === "MULTIPLA_ESCOLHA" ? (
                    <View style={s.optionsWrap}>
                      {question.options.map((option) => (
                        <View key={option.id} style={s.optionRow}>
                          <View style={s.optionCircle} />
                          <Text style={s.optionText}>
                            {option.label}) {option.text}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={s.boolRow}>
                      <View style={s.boolOption}>
                        <View style={s.optionCircle} />
                        <Text style={s.boolText}>Certo</Text>
                      </View>
                      <View style={s.boolOption}>
                        <View style={s.optionCircle} />
                        <Text style={s.boolText}>Errado</Text>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ))}

        <View style={s.footer} fixed>
          <View style={s.footerRule} />
          <View style={s.footerRow}>
            <Text style={s.footerText}>
              {appSettings.appName} · <Link src={siteUrl} style={s.footerLink}>{siteHost}</Link>
            </Text>
            <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} fixed />
          </View>
        </View>
      </Page>

      <Page size="A4" style={s.page} wrap>
        <View style={s.header} fixed>
          <Link src={siteUrl}>
            {logoDataUri ? <Image src={logoDataUri} style={s.headerLogo} /> : <Text style={s.headerAppName}>{appSettings.appName}</Text>}
          </Link>
          <Text style={s.headerBadge}>Bloco de questões</Text>
        </View>

        <Text style={s.sectionTitle}>Gabarito e comentários</Text>
        {questions.map((question, i) => (
          <View key={question.id} style={s.answerKeyRow} wrap={false}>
            <Text style={s.answerKeyNumber}>{i + 1}.</Text>
            <View style={s.answerKeyBody}>
              <Text style={s.answerKeyAnswer}>Gabarito: {correctAnswerLabel(question)}</Text>
              <Text style={s.answerKeyExplanation}>{question.explanation}</Text>
            </View>
          </View>
        ))}

        <View style={s.footer} fixed>
          <View style={s.footerRule} />
          <View style={s.footerRow}>
            <Text style={s.footerText}>
              {appSettings.appName} · <Link src={siteUrl} style={s.footerLink}>{siteHost}</Link>
            </Text>
            <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} fixed />
          </View>
        </View>
      </Page>
    </Document>
  );

  const safeTitle = set.title.replace(/[^\w\-]+/g, "_").slice(0, 60) || "bloco";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${safeTitle}.pdf"`
    }
  });
}
