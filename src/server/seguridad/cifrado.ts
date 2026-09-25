import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifrado simétrico AES-256-GCM para secretos que el servidor necesita en
 * claro (por ejemplo, el secreto HMAC de cada sistema integrado: para
 * verificar una firma hay que poder recalcularla, así que un hash no alcanza).
 *
 * Formato: "v1.<iv>.<tag>.<datos>" en base64url. GCM autentica: un texto
 * alterado no se descifra, falla.
 */

const VERSION = "v1";

function claveDesde(claveMaestraBase64: string): Buffer {
  const clave = Buffer.from(claveMaestraBase64, "base64");
  if (clave.length !== 32) throw new Error("La clave maestra debe tener 32 bytes (base64)");
  return clave;
}

export function cifrar(texto: string, claveMaestraBase64: string): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", claveDesde(claveMaestraBase64), iv);
  const datos = Buffer.concat([cifrador.update(texto, "utf8"), cifrador.final()]);
  const tag = cifrador.getAuthTag();
  return [VERSION, iv, tag, datos]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function descifrar(cifrado: string, claveMaestraBase64: string): string {
  const [version, iv, tag, datos] = cifrado.split(".");
  if (version !== VERSION || !iv || !tag || !datos)
    throw new Error("Formato de secreto cifrado inválido");
  const descifrador = createDecipheriv(
    "aes-256-gcm",
    claveDesde(claveMaestraBase64),
    Buffer.from(iv, "base64url"),
  );
  descifrador.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    descifrador.update(Buffer.from(datos, "base64url")),
    descifrador.final(),
  ]).toString("utf8");
}

/** Secreto aleatorio para un sistema integrado (256 bits, base64url). */
export function generarSecreto(): string {
  return randomBytes(32).toString("base64url");
}
