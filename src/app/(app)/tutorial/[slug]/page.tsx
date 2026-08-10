import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

/** A partir daqui o sumário-âncora do topo vale a pena — guias curtos não precisam dele. */
const TOC_MIN_STEPS = 4;

export default async function TutorialGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;

  const [guide, siblings] = await Promise.all([
    prisma.tutorialGuide.findUnique({
      where: { slug },
      include: { steps: { orderBy: { order: "asc" } } }
    }),
    prisma.tutorialGuide.findMany({
      where: { isPublished: true },
      orderBy: { displayOrder: "asc" },
      select: { slug: true, title: true }
    })
  ]);
  if (!guide || !guide.isPublished) notFound();

  const index = siblings.findIndex((s) => s.slug === guide.slug);
  const prev = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/tutorial" className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
        <ArrowLeft className="h-4 w-4" />
        Todos os guias
      </Link>

      <div>
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary-soft)]">
            <i className={`ti ${guide.icon} text-lg text-[var(--primary-soft-foreground)]`} aria-hidden />
          </div>
          <h1 className="text-3xl font-bold">{guide.title}</h1>
        </div>
        <p className="mt-2 text-[var(--muted-foreground)]">{guide.description}</p>
      </div>

      {guide.steps.length >= TOC_MIN_STEPS && (
        <nav className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-4 text-sm">
          <p className="mb-2 font-semibold">Nesta página</p>
          <ol className="space-y-1">
            {guide.steps.map((step) => (
              <li key={step.id}>
                <a href={`#passo-${step.order}`} className="text-[var(--primary)] hover:underline">
                  {step.order}. {step.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="space-y-10">
        {guide.steps.map((step) => (
          <section key={step.id} id={`passo-${step.order}`} className="scroll-mt-20 space-y-3">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-sm font-bold text-[var(--primary-foreground)]">
                {step.order}
              </span>
              {step.title}
            </h2>
            <MarkdownContent content={step.body} />
            {step.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- proporções variam por passo (recorte de elemento vs. página inteira); WebP já otimizado na captura.
              <img
                src={step.imageUrl}
                alt={step.imageAlt ?? step.title}
                className="w-full rounded-lg border border-[var(--border)] shadow-[var(--shadow-sm)]"
              />
            )}
          </section>
        ))}
      </div>

      {guide.ctaUrl && guide.ctaLabel && (
        <div className="flex justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-6">
          <Button asChild size="lg">
            <Link href={guide.ctaUrl}>
              {guide.ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}

      {(prev || next) && (
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-6">
          {prev ? (
            <Link href={`/tutorial/${prev.slug}`} className="group flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/tutorial/${next.slug}`} className="group flex items-center gap-1.5 text-right text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              {next.title}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
