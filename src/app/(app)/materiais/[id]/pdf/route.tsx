import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscriptions";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  await requireActiveSubscription(user);
  const { id } = await params;
  const material = await prisma.studyMaterial.findFirst({
    where: { id, userId: user.id },
    include: { subject: true, topic: true }
  });
  if (!material) return new Response("Material não encontrado.", { status: 404 });

  const buffer = await renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{material.title}</Text>
        <Text style={styles.meta}>{material.subject?.name ?? "Material"} {material.topic ? `/ ${material.topic.name}` : ""}</Text>
        <View style={styles.content}>
          {material.content.split("\n").map((line, index) => (
            <Text key={`${line}-${index}`} style={line.startsWith("#") ? styles.heading : styles.paragraph}>
              {line.replace(/^#+\s*/, "") || " "}
            </Text>
          ))}
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

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, color: "#1f2a2a" },
  title: { fontSize: 24, fontWeight: 700, marginBottom: 8 },
  meta: { fontSize: 10, color: "#5f6f70", marginBottom: 24 },
  content: { gap: 6 },
  heading: { fontSize: 15, fontWeight: 700, marginTop: 12, marginBottom: 4 },
  paragraph: { lineHeight: 1.45, marginBottom: 4 }
});
