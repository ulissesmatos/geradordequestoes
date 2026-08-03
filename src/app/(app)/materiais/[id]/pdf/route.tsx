import React from "react";
import { Document, Page, Text, View, Image, Link, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscriptions";
import { getAppSettings } from "@/lib/app-settings";
import { appUrl } from "@/lib/payments";
import { formatDateBR } from "@/lib/dates";

export const runtime = "nodejs";

type MdBlock =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: { n: number; text: string }[] }
  | { type: "table"; header: string[] | null; rows: string[][] }
  | { type: "hr" };

function parseMd(raw: string): MdBlock[] {
  const result: MdBlock[] = [];
  const lines = raw.replace(/\n{3,}/g, "\n\n").trim().split("\n");
  let uls: string[] = [];
  let ols: { n: number; text: string }[] = [];
  let tableRows: string[][] = [];
  let tableHasHeader = false;

  function flushLists() {
    if (uls.length) { result.push({ type: "ul", items: [...uls] }); uls = []; }
    if (ols.length) { result.push({ type: "ol", items: [...ols] }); ols = []; }
  }

  function flushTable() {
    if (!tableRows.length) return;
    result.push({
      type: "table",
      header: tableHasHeader ? tableRows[0] : null,
      rows: tableHasHeader ? tableRows.slice(1) : tableRows
    });
    tableRows = [];
    tableHasHeader = false;
  }

  function flush() {
    flushLists();
    flushTable();
  }

  for (const rawLine of lines) {
    const l = rawLine.trim();

    // Linha de tabela markdown: | a | b |
    if (l.startsWith("|") && l.endsWith("|")) {
      flushLists();
      const cells = l.slice(1, -1).split("|").map((c) => c.trim());
      // Linha separadora: |---|---|
      if (cells.every((c) => /^[-:]+$/.test(c))) {
        if (tableRows.length === 1) tableHasHeader = true;
        continue;
      }
      tableRows.push(cells);
      continue;
    }
    if (tableRows.length) flushTable();

    // Linha em branco NÃO fecha lista: markdown de IA costuma separar cada item de lista
    // por uma linha em branco, e fechar aqui fragmentava "1. a / 2. b / 3. c" em blocos
    // isolados (cada um com margem própria de bloco), inflando o espaço entre itens.
    if (!l) continue;
    if (/^-{3,}$/.test(l)) { flushLists(); result.push({ type: "hr" }); continue; }
    if (l.startsWith("### ")) { flushLists(); result.push({ type: "h3", text: l.slice(4) }); continue; }
    if (l.startsWith("## ")) { flushLists(); result.push({ type: "h2", text: l.slice(3) }); continue; }
    if (l.startsWith("# ")) { flushLists(); result.push({ type: "h1", text: l.slice(2) }); continue; }
    const b = l.match(/^[-*]\s+(.+)$/);
    if (b) { if (ols.length) flushLists(); uls.push(b[1]); continue; }
    const n = l.match(/^(\d+)[.)]\s+(.+)$/);
    if (n) { if (uls.length) flushLists(); ols.push({ n: Number(n[1]), text: n[2] }); continue; }
    flushLists();
    result.push({ type: "p", text: l });
  }
  flush();
  return result;
}

type PdfStyles = ReturnType<typeof buildStyles>;

function inlineParts(text: string, s: PdfStyles) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <Text key={i} style={s.bold}>{part.slice(2, -2)}</Text>
      : <Text key={i}>{part}</Text>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Baixa a logo configurada no branding e converte pra data URI — @react-pdf/renderer
 *  não sabe ler o filesystem do bundle serverless (o /public não é rastreado pelo
 *  `nft` da Vercel), então buscamos por HTTP a mesma URL que o navegador usaria.
 *  Falha silenciosa: sem logo, o cabeçalho cai pro nome do app em texto. */
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
  const rowAlt = "#f6f8f6";

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

    // Cabeçalho fixo (repete em toda página)
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

    // Bloco de título (só na primeira página, faz parte do fluxo normal)
    hero: { marginBottom: 4 },
    accentBar: { width: 42, height: 4, backgroundColor: accent, borderRadius: 2, marginBottom: 14 },
    title: { fontSize: 22, fontWeight: "bold", color: foreground, lineHeight: 1.25, marginBottom: 12 },
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

    // Corpo do conteúdo
    h1: {
      fontSize: 18,
      fontWeight: "bold",
      color: primary,
      marginTop: 15,
      marginBottom: 7,
      paddingBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: hexToRgba(primary, 0.2)
    },
    h2: { fontSize: 15, fontWeight: "bold", color: primary, marginTop: 12, marginBottom: 5 },
    h3: { fontSize: 12.5, fontWeight: "bold", color: foreground, marginTop: 10, marginBottom: 3 },
    hr: { borderBottomWidth: 1, borderBottomColor: border, marginTop: 7, marginBottom: 7 },
    p: { lineHeight: 1.3, marginBottom: 6 },
    list: { marginBottom: 6 },
    listRow: { flexDirection: "row", marginBottom: 2, alignItems: "flex-start" },
    bulletDotWrap: { width: 14, paddingTop: 5 },
    bulletDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: accent },
    olNum: { width: 20, fontSize: 11, fontWeight: "bold", color: primary },
    listText: { flex: 1, lineHeight: 1.35 },

    // Tabelas
    table: { marginTop: 4, marginBottom: 10, borderWidth: 1, borderColor: border },
    tableHeaderRow: { flexDirection: "row", backgroundColor: hexToRgba(primary, 0.1) },
    tableRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: border },
    tableRowAlt: { backgroundColor: rowAlt },
    tableCell: { flex: 1, paddingVertical: 5, paddingHorizontal: 8, borderRightWidth: 1, borderRightColor: border },
    tableHeaderText: { fontSize: 9.5, fontWeight: "bold", color: primary },
    tableCellText: { fontSize: 9.5, lineHeight: 1.4 },

    // Rodapé fixo (repete em toda página)
    footer: { position: "absolute", bottom: 28, left: 48, right: 48 },
    footerRule: { borderBottomWidth: 1, borderBottomColor: border, marginBottom: 8 },
    footerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    footerText: { fontSize: 8.5, color: muted },
    footerLink: { fontSize: 8.5, color: primary, textDecoration: "none" }
  });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  await requireActiveSubscription(user);
  const { id } = await params;
  const material = await prisma.studyMaterial.findFirst({
    where: { id, userId: user.id },
    include: { subject: true, topic: true }
  });
  if (!material) return new Response("Material não encontrado.", { status: 404 });

  const appSettings = await getAppSettings();
  const s = buildStyles(appSettings.primaryColor, appSettings.accentColor);
  const logoDataUri = await loadLogoDataUri(appSettings.logoUrl);
  const siteUrl = appUrl();
  const siteHost = siteUrl.replace(/^https?:\/\//i, "");
  const blocks = parseMd(material.content);

  const buffer = await renderToBuffer(
    <Document title={material.title} author={appSettings.appName} creator={appSettings.appName}>
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          {logoDataUri ? (
            <Image src={logoDataUri} style={s.headerLogo} />
          ) : (
            <Text style={s.headerAppName}>{appSettings.appName}</Text>
          )}
          <Text style={s.headerBadge}>Material de estudo</Text>
        </View>

        <View style={s.hero}>
          <View style={s.accentBar} />
          <Text style={s.title}>{material.title}</Text>
          {(material.subject || material.topic) ? (
            <View style={s.tagsRow}>
              {material.subject ? (
                <View style={s.tag}>
                  <Text style={s.tagText}>{material.subject.name}</Text>
                </View>
              ) : null}
              {material.topic ? (
                <View style={[s.tag, s.tagAccent]}>
                  <Text style={[s.tagText, s.tagAccentText]}>{material.topic.name}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <Text style={s.generatedAt}>Gerado em {formatDateBR(material.createdAt, "long")}</Text>
        </View>
        <View style={s.heroDivider} />

        <View>
          {blocks.map((block, i) => {
            switch (block.type) {
              case "h1":
                return <Text key={i} style={s.h1}>{inlineParts(block.text, s)}</Text>;
              case "h2":
                return <Text key={i} style={s.h2}>{inlineParts(block.text, s)}</Text>;
              case "h3":
                return <Text key={i} style={s.h3}>{inlineParts(block.text, s)}</Text>;
              case "hr":
                return <View key={i} style={s.hr} />;
              case "ul":
                return (
                  <View key={i} style={s.list}>
                    {block.items.map((item, j) => (
                      <View key={j} style={s.listRow}>
                        <View style={s.bulletDotWrap}>
                          <View style={s.bulletDot} />
                        </View>
                        <Text style={s.listText}>{inlineParts(item, s)}</Text>
                      </View>
                    ))}
                  </View>
                );
              case "ol":
                return (
                  <View key={i} style={s.list}>
                    {block.items.map((item, j) => (
                      <View key={j} style={s.listRow}>
                        <Text style={s.olNum}>{item.n}.</Text>
                        <Text style={s.listText}>{inlineParts(item.text, s)}</Text>
                      </View>
                    ))}
                  </View>
                );
              case "table":
                return (
                  <View key={i} style={s.table} wrap={false}>
                    {block.header ? (
                      <View style={s.tableHeaderRow}>
                        {block.header.map((cell, ci) => (
                          <View key={ci} style={s.tableCell}>
                            <Text style={s.tableHeaderText}>{inlineParts(cell, s)}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {block.rows.map((row, ri) => (
                      <View key={ri} style={ri % 2 === 1 ? [s.tableRow, s.tableRowAlt] : s.tableRow}>
                        {row.map((cell, ci) => (
                          <View key={ci} style={s.tableCell}>
                            <Text style={s.tableCellText}>{inlineParts(cell, s)}</Text>
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                );
              case "p":
                return <Text key={i} style={s.p}>{inlineParts(block.text, s)}</Text>;
              default:
                return null;
            }
          })}
        </View>

        <View style={s.footer} fixed>
          <View style={s.footerRule} />
          <View style={s.footerRow}>
            <Text style={s.footerText}>
              {appSettings.appName} · <Link src={siteUrl} style={s.footerLink}>{siteHost}</Link>
            </Text>
            <Text
              style={s.footerText}
              render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
              fixed
            />
          </View>
        </View>
      </Page>
    </Document>
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="material-${material.id}.pdf"`
    }
  });
}
