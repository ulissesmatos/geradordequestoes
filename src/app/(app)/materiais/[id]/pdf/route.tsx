import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscriptions";

export const runtime = "nodejs";

type MdBlock =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: { n: number; text: string }[] }
  | { type: "hr" };

function parseMd(raw: string): MdBlock[] {
  const result: MdBlock[] = [];
  const lines = raw.replace(/\n{3,}/g, "\n\n").trim().split("\n");
  let uls: string[] = [];
  let ols: { n: number; text: string }[] = [];

  function flush() {
    if (uls.length) { result.push({ type: "ul", items: [...uls] }); uls = []; }
    if (ols.length) { result.push({ type: "ol", items: [...ols] }); ols = []; }
  }

  for (const rawLine of lines) {
    const l = rawLine.trim();
    if (!l) { flush(); continue; }
    if (/^-{3,}$/.test(l)) { flush(); result.push({ type: "hr" }); continue; }
    if (l.startsWith("### ")) { flush(); result.push({ type: "h3", text: l.slice(4) }); continue; }
    if (l.startsWith("## ")) { flush(); result.push({ type: "h2", text: l.slice(3) }); continue; }
    if (l.startsWith("# ")) { flush(); result.push({ type: "h1", text: l.slice(2) }); continue; }
    const b = l.match(/^[-*]\s+(.+)$/);
    if (b) { if (ols.length) flush(); uls.push(b[1]); continue; }
    const n = l.match(/^(\d+)[.)]\s+(.+)$/);
    if (n) { if (uls.length) flush(); ols.push({ n: Number(n[1]), text: n[2] }); continue; }
    flush();
    result.push({ type: "p", text: l });
  }
  flush();
  return result;
}

function inlineParts(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <Text key={i} style={s.bold}>{part.slice(2, -2)}</Text>
      : <Text key={i}>{part}</Text>
  );
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

  const blocks = parseMd(material.content);
  const metaLine = [material.subject?.name, material.topic?.name].filter(Boolean).join(" / ");

  const buffer = await renderToBuffer(
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>{material.title}</Text>
        {metaLine ? <Text style={s.meta}>{metaLine}</Text> : null}
        <View style={s.body}>
          {blocks.map((block, i) => {
            switch (block.type) {
              case "h1":
                return <Text key={i} style={s.h1}>{inlineParts(block.text)}</Text>;
              case "h2":
                return <Text key={i} style={s.h2}>{inlineParts(block.text)}</Text>;
              case "h3":
                return <Text key={i} style={s.h3}>{inlineParts(block.text)}</Text>;
              case "hr":
                return <View key={i} style={s.hr} />;
              case "ul":
                return (
                  <View key={i} style={s.list}>
                    {block.items.map((item, j) => (
                      <View key={j} style={s.listRow}>
                        <Text style={s.bullet}>•</Text>
                        <Text style={s.listText}>{inlineParts(item)}</Text>
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
                        <Text style={s.listText}>{inlineParts(item.text)}</Text>
                      </View>
                    ))}
                  </View>
                );
              case "p":
                return <Text key={i} style={s.p}>{inlineParts(block.text)}</Text>;
              default:
                return null;
            }
          })}
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

const s = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: "Helvetica", color: "#1a1a1a" },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 6 },
  meta: { fontSize: 10, color: "#666666", marginBottom: 22 },
  bold: { fontWeight: "bold" },
  body: {},
  h1: { fontSize: 20, fontWeight: "bold", marginTop: 20, marginBottom: 8 },
  h2: { fontSize: 16, fontWeight: "bold", marginTop: 16, marginBottom: 6 },
  h3: { fontSize: 13, fontWeight: "bold", marginTop: 12, marginBottom: 4 },
  hr: { borderBottomWidth: 1, borderBottomColor: "#dddddd", marginTop: 10, marginBottom: 10 },
  p: { lineHeight: 1.65, marginBottom: 8 },
  list: { marginBottom: 8 },
  listRow: { flexDirection: "row", marginBottom: 3 },
  bullet: { width: 12, fontSize: 11 },
  olNum: { width: 20, fontSize: 11 },
  listText: { flex: 1, lineHeight: 1.5 }
});
