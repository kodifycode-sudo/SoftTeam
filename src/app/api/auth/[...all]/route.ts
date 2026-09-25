import { obtenerAuth } from "@/server/auth";

async function manejar(request: Request) {
  const auth = await obtenerAuth();
  return auth.handler(request);
}

export { manejar as GET, manejar as POST };
