export { auth as middleware } from "@/auth";

export const config = {
  matcher: ["/dashboard/:path*", "/materias/:path*", "/questoes/:path*", "/revisao/:path*", "/perfil/:path*", "/admin/:path*"]
};
