import type { NextConfig } from "next";

const securityHeaders = [
  // Impede sniffing de content-type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Impede o site de ser embutido em iframes (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Não vaza URL completa para outros domínios.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desliga APIs sensíveis do navegador que o app não usa.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HTTPS forçado por 1 ano (ignorado em http://localhost).
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "bcrypt", "unpdf", "pdfjs-dist"],
  experimental: {
    serverActions: {
      // Upload de PDFs de provas em /admin/referencias (padrão é 1 MB).
      bodySizeLimit: "16mb"
    }
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  }
};

export default nextConfig;
