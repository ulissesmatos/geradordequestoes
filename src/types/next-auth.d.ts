import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: Role;
      isBlocked?: boolean;
    };
  }

  interface User {
    role?: Role;
    isBlocked?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
    isBlocked?: boolean;
  }
}
