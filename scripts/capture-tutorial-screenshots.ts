import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { TUTORIAL_GUIDES } from "../prisma/tutorial-content";

/**
 * Gera os prints de public/tutorial/** a partir de TUTORIAL_GUIDES (prisma/tutorial-content.ts).
 *
 * Roda contra um `npm run dev` já de pé, LOCAL — os dados fotografados são fictícios (ver
 * scripts/seed-tutorial-demo.ts) e nunca devem existir em produção. Login pela tela real de
 * /login, sem atalho de autenticação só pra automação.
 */

const BASE_URL = process.env.TUTORIAL_CAPTURE_BASE_URL ?? "http://localhost:3000";
const DEMO_EMAIL = "demo.tutorial@local.test";
const DEMO_PASSWORD = process.env.TUTORIAL_DEMO_PASSWORD ?? "tutorial-demo-2026";

// Documentação permanente, não anexo efêmero de chat — dimensão maior e qualidade mais alta
// que compressImage() em src/app/(app)/api/uploads/route.ts (1280px/80), pra manter texto nítido.
const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 85;

async function resolvePlaceholders(url: string): Promise<string> {
  if (url.includes(":chatSessionId") || url.includes(":chatQuestionSetId")) {
    const session = await prisma.aiChatSession.findFirstOrThrow({
      where: { user: { email: DEMO_EMAIL } },
      select: { id: true, questionSets: { select: { id: true }, take: 1 } }
    });
    url = url.replace(":chatSessionId", session.id);
    if (session.questionSets[0]) url = url.replace(":chatQuestionSetId", session.questionSets[0].id);
  }
  if (url.includes(":mockExamId")) {
    const session = await prisma.mockExamSession.findFirstOrThrow({
      where: { user: { email: DEMO_EMAIL } },
      select: { mockExamId: true }
    });
    url = url.replace(":mockExamId", session.mockExamId);
  }
  return url;
}

/**
 * Fecha qualquer popup (Popup/PopupManager) aberto na tela — não é conteúdo do tutorial.
 * Roda ANTES de qualquer `click` do próprio passo (ex.: abrir o modal de compartilhar), então
 * nunca fecha um diálogo que o passo abriu de propósito — só o que já estava lá ao navegar.
 */
async function dismissPopup(page: Page) {
  // Dialog.tsx fecha com Escape (ver useEffect de keydown) — mais robusto que caçar o texto
  // do botão, que é configurável por popup (`dismissLabel`). Repete: em dev o React monta o
  // PopupManager 2x (Strict Mode), então o popup pode reabrir um instante depois do 1º Escape.
  for (let attempt = 0; attempt < 3; attempt++) {
    const visible = await page.locator('[role="dialog"]').first().isVisible().catch(() => false);
    if (!visible) return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
}

async function writeWebp(buffer: Buffer, outPath: string) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(buffer)
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toFile(outPath);
}

async function main() {
  const publicDir = path.join(__dirname, "..", "public");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  page.on("pageerror", (err) => console.error("[pageerror]", err.message));

  console.log(`Login em ${BASE_URL}/login…`);
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="email"]', DEMO_EMAIL);
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.click('button:has-text("Entrar")');
  await page.waitForURL("**/ai", { timeout: 20000 });

  let captured = 0;
  let skipped = 0;

  for (const guide of TUTORIAL_GUIDES) {
    for (const step of guide.steps) {
      if (!step.capture || !step.imageUrl) {
        skipped++;
        continue;
      }
      const url = await resolvePlaceholders(step.capture.url);
      const label = `${guide.slug}/${String(step.order).padStart(2, "0")}`;

      try {
        await page.goto(`${BASE_URL}${url}`, { waitUntil: "networkidle", timeout: 30000 });
        // PopupManager abre com um setTimeout de 500ms (ver OPEN_DELAY_MS) — networkidle não
        // espera por ele, só por rede. Sem essa pausa, o popup abre DEPOIS do dismiss e
        // intercepta o clique do passo seguinte (foi exatamente o que quebrou 1ª tentativa).
        await page.waitForTimeout(700);
        await dismissPopup(page);

        if (step.capture.click) {
          // Checagem extra bem em cima do clique: cobre um popup que reabriu no intervalo
          // entre o dismiss acima e agora (foi o que produziu um print errado na 1ª rodada).
          await dismissPopup(page);
          await page.locator(step.capture.click).first().click({ timeout: 10000 });
          await page.waitForTimeout(400);
        }
        if (step.capture.waitFor) {
          await page.locator(step.capture.waitFor).first().waitFor({ state: "visible", timeout: 15000 });
        }
        await page.waitForTimeout(300); // acomoda animações/transições finais

        let buffer: Buffer;
        if (step.capture.selector) {
          const target = step.capture.selectorIndex != null
            ? page.locator(step.capture.selector).nth(step.capture.selectorIndex)
            : page.locator(step.capture.selector).first();
          await target.waitFor({ state: "visible", timeout: 15000 });
          buffer = await target.screenshot();
        } else {
          buffer = await page.screenshot({ fullPage: true });
        }

        const outPath = path.join(publicDir, step.imageUrl);
        await writeWebp(buffer, outPath);
        captured++;
        console.log(`✓ ${label} <- ${url}`);
      } catch (error) {
        console.error(`✗ ${label} <- ${url}:`, error instanceof Error ? error.message : error);
      }
    }
  }

  await browser.close();
  console.log(`\nCapturadas: ${captured} · sem captura (texto só): ${skipped}`);
}

main()
  .catch((error) => {
    console.error("FALHOU:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
