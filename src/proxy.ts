import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Chequeo optimista: sin cookie de sesión, a login. No valida la sesión (eso
 * lo hacen los layouts y cada acción en el servidor); solo evita renderizar
 * de más y conserva la ruta de destino.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  const destino = request.nextUrl.pathname + request.nextUrl.search;
  const login = new URL("/ingresar", request.url);
  login.searchParams.set("destino", destino);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/admin/:path*", "/portal/:path*"],
};
