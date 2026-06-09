import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  History,
  Layers3,
  Menu,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Target
} from "lucide-react";
import { PricingCards } from "@/components/pricing-cards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const heroImage =
  "https://images.pexels.com/photos/8199759/pexels-photo-8199759.jpeg?auto=compress&cs=tinysrgb&w=1600";
const studyImage =
  "https://images.pexels.com/photos/4778621/pexels-photo-4778621.jpeg?auto=compress&cs=tinysrgb&w=1200";

const features = [
  {
    icon: Bot,
    title: "Chat AI-first",
    text: "O aluno escreve do jeito dele e a IA organiza matéria, formato, dificuldade e quantidade."
  },
  {
    icon: ClipboardCheck,
    title: "Blocos salvos",
    text: "Cada geração vira um bloco de questões para responder agora ou retomar depois."
  },
  {
    icon: History,
    title: "Revisão com memória",
    text: "Erros, acertos e favoritos entram como contexto para novos treinos."
  },
  {
    icon: ShieldCheck,
    title: "Controle administrativo",
    text: "Planos, usuários, provedores de IA e revisão de questões ficam no painel admin."
  }
];

const productHighlights = [
  { icon: Layers3, title: "Banco crescente", text: "Questões geradas alimentam histórico e revisão administrativa." },
  { icon: Target, title: "Treino direcionado", text: "A IA pode usar erros, acertos e favoritas para criar revisões." },
  { icon: ClipboardCheck, title: "Simulados", text: "Gere blocos por formato, dificuldade e quantidade." },
  { icon: ShieldCheck, title: "Admin seguro", text: "Planos, usuários e provedores ficam configuráveis." }
];

export default async function HomePage() {
  const plans = await prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: { priceCents: "asc" }
  });

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)]/88 backdrop-blur">
        <div className="relative mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/brand/logo.png" alt="Gerador de Questões" width={744} height={179} className="h-11 w-auto max-w-[210px] object-contain md:h-14 md:max-w-[290px]" priority />
          </Link>
          <details className="group md:hidden">
            <summary className="flex h-10 w-10 list-none items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-sm marker:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Abrir menu</span>
            </summary>
            <nav className="absolute left-3 right-3 top-[calc(100%+8px)] z-40 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
              <Link href="/pricing" className="block rounded-md px-3 py-3 text-sm font-semibold hover:bg-[var(--surface-subtle)]">Planos</Link>
              <Link href="/login" className="block rounded-md px-3 py-3 text-sm font-semibold hover:bg-[var(--surface-subtle)]">Entrar</Link>
              <Link href="/register" className="mt-1 block rounded-md bg-[var(--primary)] px-3 py-3 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]">Criar conta</Link>
            </nav>
          </details>
          <nav className="hidden items-center gap-2 md:flex">
            <Button asChild variant="ghost" size="sm">
              <Link href="/pricing">Planos</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">Criar conta</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:px-6 lg:grid-cols-[1.03fr_0.97fr] lg:items-center lg:py-20">
        <div>
          <Badge variant="secondary" className="mb-5 gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            SaaS AI-first para concursos públicos
          </Badge>
          <h1 className="max-w-4xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
            Gere questões, simulados e revisões com IA em poucos segundos.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted-foreground)]">
            Uma plataforma para transformar prompts em blocos salvos de estudo, acompanhar desempenho e criar um banco de questões revisável com o tempo.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/register">
                Criar conta <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/pricing">Ver planos</Link>
            </Button>
          </div>
          <div className="mt-9 grid max-w-2xl gap-3 sm:grid-cols-3">
            {["Chat com contexto", "C/E e alternativas", "Histórico salvo"].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm font-semibold text-[var(--muted-foreground)]">
                <CheckCircle2 className="h-4 w-4 text-[var(--primary)]" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl">
            <img src={heroImage} alt="Pessoa estudando para concurso com livros e notebook" className="h-[420px] w-full object-cover" />
          </div>
          <Card className="absolute -bottom-6 left-4 right-4 shadow-xl md:left-auto md:w-[360px]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--primary-soft)]">
                  <BrainCircuit className="h-5 w-5 text-[var(--primary)]" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Revisão inteligente</p>
                  <p className="text-xs text-[var(--muted-foreground)]">Erros recentes viram novos treinos com IA.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 md:px-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <Card key={feature.title} className="rounded-md">
              <CardContent className="p-5">
                <feature.icon className="h-6 w-6 text-[var(--primary)]" />
                <h3 className="mt-5 text-lg font-semibold">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{feature.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-sm">
          <img src={studyImage} alt="Estudos para concurso com anotações e computador" className="h-[390px] w-full object-cover" />
        </div>
        <div>
          <Badge variant="outline">Como funciona</Badge>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">O aluno conversa. O sistema salva o treino.</h2>
          <div className="mt-7 space-y-5">
            {[
              ["1", "Peça do seu jeito", "Ex.: “gere 10 questões difíceis de geografia com 5 alternativas”."],
              ["2", "A IA monta o bloco", "O gerador cria questões estruturadas, alternativas, gabarito e justificativas."],
              ["3", "Responda ou salve", "Tudo fica disponível no histórico para estudar, simular e revisar depois."]
            ].map(([step, title, text]) => (
              <div key={step} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-sm font-bold text-white">
                  {step}
                </span>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 md:px-6">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-4 md:p-6">
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-md bg-[var(--surface)] p-5 shadow-sm">
              <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">
                <MessageSquareText className="h-4 w-4" />
                Chat IA
              </div>
              <div className="space-y-4">
                <div className="ml-auto max-w-[82%] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm shadow-sm">
                  Gere uma revisão dos meus erros em informática básica.
                </div>
                <div className="max-w-[88%] rounded-lg bg-[var(--primary-soft)] p-4 text-sm leading-6 text-[var(--primary-soft-foreground)]">
                  Boa. Gerei um bloco de revisão com foco nos temas em que você mais errou. O treino já ficou salvo no seu histórico.
                  <div className="mt-3 inline-flex rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white">
                    Responder agora
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {productHighlights.map(({ icon: Icon, title, text }) => (
                <Card key={title} className="rounded-md">
                  <CardContent className="p-5">
                    <Icon className="h-5 w-5 text-[var(--accent)]" />
                    <h3 className="mt-4 font-semibold">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{text}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <PricingCards plans={plans} compact />
      </div>

      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-[var(--muted-foreground)] md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex items-center gap-3">
            <Image src="/brand/logo.png" alt="Gerador de Questões" width={744} height={179} className="h-8 w-auto object-contain" />
          </div>
          <div className="flex gap-4">
            <Link href="/pricing" className="hover:text-[var(--foreground)]">Planos</Link>
            <Link href="/login" className="hover:text-[var(--foreground)]">Entrar</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
