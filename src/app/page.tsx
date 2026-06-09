import Link from "next/link";
import { ArrowRight, Bot, CheckCircle2, ClipboardCheck, History, Layers3, LockKeyhole, MessageSquareText, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const heroImage =
  "https://images.pexels.com/photos/8199759/pexels-photo-8199759.jpeg?auto=compress&cs=tinysrgb&w=1600";

const features = [
  {
    icon: Bot,
    title: "Chat que entende o pedido",
    text: "O aluno escreve como pensa: a IA identifica matéria, formato, dificuldade e quantidade."
  },
  {
    icon: ClipboardCheck,
    title: "Questões salvas por bloco",
    text: "Cada geração vira um bloco no histórico para responder agora, revisar depois ou transformar em simulado."
  },
  {
    icon: History,
    title: "Revisão com memória",
    text: "Erros, acertos e favoritos entram como contexto para novos treinos, sem copiar enunciados antigos."
  },
  {
    icon: ShieldCheck,
    title: "Banco revisado pelo admin",
    text: "Questões privadas podem ser aprovadas antes de virar base pública para outros alunos."
  }
];

const steps = [
  "Peça do seu jeito",
  "A IA organiza o bloco",
  "Responda agora ou salve",
  "Revise com base no desempenho"
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="fixed left-0 right-0 top-0 z-30 border-b border-white/20 bg-[var(--surface-strong)]/50 backdrop-blur">
        <div className="flex w-full items-center justify-between px-4 py-3 md:px-8">
          <Link href="/" className="text-base font-extrabold tracking-tight text-white">
            Questões C/E
          </Link>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="!text-white hover:bg-white/15">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild size="sm" className="bg-[var(--surface)] !text-[var(--foreground)] hover:bg-[var(--muted)]">
              <Link href="/register">Criar conta</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="relative flex min-h-[78vh] items-end overflow-hidden">
        <img src={heroImage} alt="Estudantes em biblioteca usando notebook e livros" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[var(--surface-strong)]/64" />
        <div className="relative z-10 w-full px-4 pb-14 pt-28 md:px-8 lg:pb-20">
          <div className="max-w-4xl">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-sm font-semibold text-white backdrop-blur">
              <Sparkles className="h-4 w-4" />
              SaaS AI-first para questões de concurso público
            </p>
            <h1 className="max-w-4xl text-4xl font-extrabold leading-tight text-white md:text-7xl">
              Gere, responda e revise questões com IA sem perder o histórico.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/85">
              O aluno conversa com a IA, cria blocos de estudo em Certo/Errado ou múltipla escolha, salva tudo no painel e revisa com base no próprio desempenho.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-[var(--surface)] !text-[var(--foreground)] hover:bg-[var(--muted)]">
                <Link href="/register">
                  Começar agora <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="border-white/40 bg-white/10 !text-white hover:bg-white/20">
                <Link href="/login">Acessar minha conta</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="grid gap-4 px-4 py-5 md:grid-cols-4 md:px-8">
          {steps.map((step, index) => (
            <div key={step} className="flex items-center gap-3 text-sm font-semibold text-[var(--foreground)]">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                {index + 1}
              </span>
              {step}
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 py-16 md:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-[var(--primary)]">Experiência principal</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-extrabold md:text-5xl">
              A primeira tela do aluno é o chat, não um formulário.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--muted-foreground)]">
              A IA interpreta pedidos curtos, pede direção quando faltar contexto e transforma a conversa em blocos salvos para estudo, simulado ou revisão.
            </p>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3 shadow-sm">
            <div className="rounded-md bg-[var(--surface)] p-4 shadow-sm">
              <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">
                <MessageSquareText className="h-4 w-4" />
                Chat IA
              </div>
              <div className="space-y-4">
                <div className="ml-auto max-w-[80%] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm shadow-sm">
                  Gere um simulado difícil de informática básica com 5 alternativas.
                </div>
                <div className="max-w-[86%] rounded-lg bg-[var(--primary-soft)] p-4 text-sm leading-6 text-[var(--primary-soft-foreground)]">
                  Boa. Preparei um simulado com 10 questões inéditas, alternativas A-E e justificativas didáticas. O bloco ficou salvo no histórico.
                  <div className="mt-3 inline-flex rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white">
                    Responder agora
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Blocos recentes</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {["Informática básica", "Português: crase", "Geografia política", "Revisão dos erros"].map((item) => (
                      <div key={item} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-sm font-semibold">
                        {item}
                        <p className="mt-1 text-xs font-normal text-[var(--muted-foreground)]">10 questões / IA / salvo</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[var(--surface-subtle)] px-4 py-16 md:px-8">
        <div className="mb-10 max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-wide text-[var(--primary)]">Por que funciona</p>
          <h2 className="mt-3 text-3xl font-extrabold md:text-5xl">Um banco de questões que cresce enquanto os alunos estudam.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <article key={feature.title} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
              <feature.icon className="h-6 w-6 text-[var(--primary)]" />
              <h3 className="mt-5 text-lg font-bold">{feature.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 px-4 py-16 md:px-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <Layers3 className="h-7 w-7 text-[var(--accent)]" />
          <h2 className="mt-5 text-3xl font-extrabold">Formatos flexíveis para concursos.</h2>
          <p className="mt-4 max-w-2xl leading-7 text-[var(--muted-foreground)]">
            Gere Certo/Errado quando quiser treinar julgamento de item ou múltipla escolha com 2 a 5 alternativas quando o objetivo for simulado tradicional.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {["Certo/Errado", "2 alternativas", "3 alternativas", "4 ou 5 alternativas"].map((format) => (
              <div key={format} className="flex items-center gap-2 rounded-md bg-[var(--muted)] px-3 py-3 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-[var(--primary)]" />
                {format}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-[#21484a] bg-[var(--surface-strong)] p-6 text-white shadow-sm">
          <LockKeyhole className="h-7 w-7 text-[#f5c85b]" />
          <h2 className="mt-5 text-3xl font-extrabold">Assinatura e uso controlado.</h2>
          <p className="mt-4 leading-7 text-white/75">
            Sem plano grátis nesta fase: o admin ativa assinaturas, define limites de IA, acompanha o uso e protege o acesso às rotas internas.
          </p>
          <Button asChild className="mt-6 bg-[var(--surface)] !text-[var(--foreground)] hover:bg-[var(--muted)]">
            <Link href="/register">Criar acesso</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
