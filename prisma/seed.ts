import { AiProvider, PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const subjects = [
  "Português",
  "Matemática",
  "Informática",
  "História",
  "Geografia",
  "Legislativo/Estado"
];

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  for (const subjectName of subjects) {
    const subject = await prisma.subject.upsert({
      where: { slug: slugify(subjectName) },
      update: {},
      create: {
        name: subjectName,
        slug: slugify(subjectName),
        description: `Questões originais de ${subjectName} no formato Certo/Errado.`
      }
    });

    await prisma.topic.upsert({
      where: {
        subjectId_slug: {
          subjectId: subject.id,
          slug: "conhecimentos-gerais"
        }
      },
      update: {},
      create: {
        subjectId: subject.id,
        name: "Conhecimentos gerais",
        slug: "conhecimentos-gerais",
        description: "Assunto inicial para geração e organização das questões."
      }
    });
  }

  const adminEmail = (process.env.ADMIN_EMAIL ?? "umatos99@gmail.com").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword && process.env.NODE_ENV === "production") {
    throw new Error("Defina ADMIN_PASSWORD nas variáveis de ambiente para criar o admin inicial em produção.");
  }
  const initialAdminPassword = adminPassword ?? "admin123456";

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: Role.ADMIN, isBlocked: false },
    create: {
      name: "Administrador",
      email: adminEmail,
      passwordHash: await bcrypt.hash(initialAdminPassword, 12),
      role: Role.ADMIN
    }
  });

  await prisma.aiProviderSetting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      provider: AiProvider.OPENAI,
      apiKey: process.env.OPENAI_API_KEY || null,
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      appName: "Questões Certo/Errado"
    }
  });

  const plans = [
    {
      name: "Essencial",
      slug: "essencial",
      description: "Geração de questões para rotina individual de estudos.",
      priceCents: 1990,
      aiGenerationsPerDay: 20
    },
    {
      name: "Pro",
      slug: "pro",
      description: "Mais gerações diárias para simulados e revisões intensivas.",
      priceCents: 4990,
      aiGenerationsPerDay: 60
    },
    {
      name: "Premium",
      slug: "premium",
      description: "Uso avançado para preparação constante.",
      priceCents: 14990,
      aiGenerationsPerDay: 150
    }
  ];

  for (const plan of plans) {
    // IMPORTANTE: `update: {}` (vazio) — o seed só cria o plano se ele não existir.
    // Nunca sobrescreve preço/descrição/limites de planos já existentes, para que
    // as edições feitas no painel admin PERSISTAM entre deploys. O alinhamento
    // único de preços é feito pela migração 20260611020000_update_plan_prices.
    await prisma.subscriptionPlan.upsert({
      where: { slug: plan.slug },
      update: {},
      create: plan
    });
  }

  // Admins não precisam de assinatura: requireActiveSubscription/assertCanGenerateWithAi
  // dão bypass total para Role.ADMIN. Criar uma assinatura "fantasma" aqui só confunde
  // o painel de perfil e os relatórios de pagamento.

  const questionsWithoutOptions = await prisma.question.findMany({
    where: { options: { none: {} }, format: "CERTO_ERRADO" }
  });

  for (const question of questionsWithoutOptions) {
    await prisma.questionOption.createMany({
      data: [
        {
          questionId: question.id,
          label: "C",
          text: "Certo",
          isCorrect: question.answer === "CERTO",
          order: 1
        },
        {
          questionId: question.id,
          label: "E",
          text: "Errado",
          isCorrect: question.answer === "ERRADO",
          order: 2
        }
      ],
      skipDuplicates: true
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
