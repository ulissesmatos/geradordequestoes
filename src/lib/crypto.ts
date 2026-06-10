import crypto from "crypto";

// Criptografia em repouso para segredos (chaves de IA e de pagamento).
// Formato: enc:v1:<iv b64>:<authTag b64>:<ciphertext b64> (AES-256-GCM).
const PREFIX = "enc:v1:";

function getKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return null;
  // Aceita qualquer string; deriva 32 bytes determinísticos via SHA-256.
  return crypto.createHash("sha256").update(raw).digest();
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * Cifra um segredo. Sem ENCRYPTION_KEY definido, retorna o texto puro
 * (degradação segura — nada quebra; a migração para cifrado acontece quando a chave existir).
 */
export function encryptSecret(plain: string): string {
  if (!plain) return plain;
  const key = getKey();
  if (!key) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * Decifra um segredo. Valores em texto puro (legado) são retornados como estão.
 * Se for cifrado mas faltar a chave/estiver corrompido, retorna "" (tratado como não configurado).
 */
export function decryptSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (!value.startsWith(PREFIX)) return value;
  const key = getKey();
  if (!key) return "";
  try {
    const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(":");
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}
