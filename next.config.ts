import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "bcrypt", "unpdf", "pdfjs-dist"]
};

export default nextConfig;
