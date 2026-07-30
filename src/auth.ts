import type { Role } from "@prisma/client";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcrypt";
import { z } from "zod";
import { claimAffiliateReferralFromCookie } from "@/lib/affiliates";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/app-settings";
import { sendEmail } from "@/lib/email/send";
import { welcomeEmailTemplate } from "@/lib/email/templates";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login"
  },
  providers: [
    Google,
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" }
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() }
        });

        // Conta só-Google (sem senha) não pode logar por credenciais.
        if (!user || user.isBlocked || !user.passwordHash) return null;

        const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isBlocked: user.isBlocked
        };
      }
    })
  ],
  callbacks: {
    // Bloqueia o login do Google para contas banidas (Credentials já trata em authorize).
    async signIn({ account, profile }) {
      if (account?.provider === "google") {
        const email = profile?.email?.toLowerCase();
        if (!email) return false;
        const existing = await prisma.user.findUnique({ where: { email }, select: { isBlocked: true } });
        if (existing?.isBlocked) return false;
      }
      return true;
    },
    async jwt({ token, user, account, profile }) {
      // Login por credenciais: o objeto `user` já vem do nosso banco.
      if (user) {
        token.role = user.role;
        token.isBlocked = user.isBlocked;
      }

      // Login pelo Google: faz upsert do usuário no nosso banco e aponta o
      // token para o User.id local (todas as relações dependem dele).
      if (account?.provider === "google" && profile?.email) {
        const email = profile.email.toLowerCase();
        const name = (profile.name as string | undefined) ?? email.split("@")[0];
        const image = (profile.picture as string | undefined) ?? null;

        const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

        const dbUser = await prisma.user.upsert({
          where: { email },
          // Não toca em passwordHash: se a conta já existe por senha, ambos os
          // métodos passam a funcionar; e-mail do Google é considerado verificado.
          update: { emailVerified: new Date(), ...(image ? { image } : {}) },
          create: {
            name,
            email,
            image,
            emailVerified: new Date(),
            // Aceite registrado na criação: a tela de cadastro avisa, junto ao botão do
            // Google, que continuar implica concordar com os Termos e a Política.
            termsAcceptedAt: new Date()
          },
          select: { id: true, role: true, isBlocked: true }
        });

        token.sub = dbUser.id;
        token.role = dbUser.role;
        token.isBlocked = dbUser.isBlocked;

        // Boas-vindas + atribuição de afiliado apenas para contas recém-criadas
        // via Google (ambos best-effort).
        if (!existing) {
          await claimAffiliateReferralFromCookie(dbUser.id);
          try {
            const appSettings = await getAppSettings();
            const tpl = welcomeEmailTemplate(name, appSettings.appName);
            await sendEmail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text });
          } catch {
            // ignora
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = token.role as Role | undefined;
        session.user.isBlocked = Boolean(token.isBlocked);
      }
      return session;
    }
  }
});
