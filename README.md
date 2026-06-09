# Questões Certo/Errado para Concursos

Plataforma independente em Next.js para gerar, revisar, gerenciar e responder questões originais no formato Certo/Errado.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Componentes no estilo shadcn/ui
- Prisma ORM
- PostgreSQL
- Auth.js/NextAuth com credenciais
- bcrypt
- OpenAI Responses API com Zod Structured Outputs

## Configuração

1. Instale dependências:

```bash
npm install
```

2. Crie `.env` a partir de `.env.example`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/perguntas_concursos"
OPENAI_API_KEY="sk-proj..."
AUTH_SECRET="gere-um-segredo-forte"
AUTH_URL="http://localhost:3000"
OPENAI_MODEL="gpt-4.1-mini"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="admin123456"
```

3. Suba um PostgreSQL local ou configure um PostgreSQL externo.

Com Docker:

```bash
docker compose up -d
```

Sem Docker, crie um banco PostgreSQL chamado `perguntas_concursos` e ajuste `DATABASE_URL`.

Se você já tem PostgreSQL instalado e aparecer erro de autenticação, troque usuário/senha no `.env`:

```env
DATABASE_URL="postgresql://SEU_USUARIO:SUA_SENHA@localhost:5432/perguntas_concursos"
```

4. Rode migration e seed:

```bash
npm run prisma:migrate
npm run prisma:seed
```

5. Inicie em desenvolvimento:

```bash
npm run dev
```

## Deploy na Vercel

Configure as variáveis `DATABASE_URL`, `OPENAI_API_KEY`, `AUTH_SECRET`, `AUTH_URL` e `OPENAI_MODEL` no painel da Vercel. Use um PostgreSQL externo, como Vercel Postgres, Neon ou Supabase. O build executa `prisma generate` antes de `next build`.

## Segurança

- A chave `OPENAI_API_KEY` é usada somente em código server-side.
- Todas as actions administrativas chamam `requireAdmin`.
- Usuários bloqueados são impedidos em `requireUser`.
- Questões geradas por alunos entram como `DRAFT` privada; admin pode aprovar para virar `APPROVED`.
- A área do aluno acessa seus próprios blocos privados e questões públicas `APPROVED`.
- A área do aluno exige assinatura ativa; admins têm bypass para teste e gestão.

## Rotas

- Públicas: `/`, `/login`, `/register`
- Usuário: `/dashboard`, `/assinatura`, `/materias`, `/materias/[slug]`, `/questoes/estudar`, `/questoes/simulado`, `/revisao`, `/perfil`
- Admin: `/admin`, `/admin/materias`, `/admin/assuntos`, `/admin/questoes`, `/admin/questoes/gerar`, `/admin/questoes/revisar`, `/admin/usuarios`, `/admin/planos`, `/admin/logs-ia`
- Configuração de IA: `/admin/ia`, com suporte a OpenAI, Claude/Anthropic e OpenRouter.

## Fluxo AI-first

- Depois do login, `/dashboard` é o chat principal de IA com input estilo assistente.
- Cada prompt gera um bloco salvo (`QuestionSet`) com questões e alternativas.
- `/questoes/estudar` mostra a biblioteca de blocos gerados, em andamento, respondidos e favoritos.
- `/questoes/simulado` gera simulados com IA e mostra resultado apenas no final.
- `/revisao` usa erros recentes como contexto para gerar novos blocos de revisão.
- Formatos suportados: Certo/Errado e múltipla escolha com 2 a 5 alternativas.

## Assinaturas

- Não há plano grátis nesta versão.
- O seed cria planos Essencial, Pro e Premium.
- O admin inicial recebe assinatura Premium automaticamente.
- Para liberar um usuário comum, acesse `/admin/usuarios` e ative um plano manualmente.
- `/admin/planos` permite criar planos e cupons para a futura integração com pagamento.
