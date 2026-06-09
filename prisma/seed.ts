import { AiProvider, PrismaClient, Role, SubscriptionStatus } from "@prisma/client";
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
      priceCents: 2990,
      aiGenerationsPerDay: 20
    },
    {
      name: "Pro",
      slug: "pro",
      description: "Mais gerações diárias para simulados e revisões intensivas.",
      priceCents: 5990,
      aiGenerationsPerDay: 60
    },
    {
      name: "Premium",
      slug: "premium",
      description: "Uso avançado para preparação constante.",
      priceCents: 9990,
      aiGenerationsPerDay: 150
    }
  ];

  let adminPlanId: string | undefined;
  for (const plan of plans) {
    const saved = await prisma.subscriptionPlan.upsert({
      where: { slug: plan.slug },
      update: plan,
      create: plan
    });
    if (plan.slug === "premium") adminPlanId = saved.id;
  }

  if (adminPlanId) {
    const existingAdminSubscription = await prisma.userSubscription.findFirst({
      where: { userId: admin.id, status: SubscriptionStatus.ACTIVE }
    });

    if (!existingAdminSubscription) {
      await prisma.userSubscription.create({
        data: {
          userId: admin.id,
          planId: adminPlanId,
          status: SubscriptionStatus.ACTIVE
        }
      });
    }
  }

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
