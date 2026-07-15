import crypto from "crypto";

// Criptografia em repouso para segredos (chaves de IA e de pagamento).
// Formato: enc:v1:<iv b64>:<authTag b64>:<ciphertext b64> (AES-256-GCM).
const PREFIX = "enc:v1:";

function getKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    // Em produção, segredos NUNCA podem ir para o banco em texto puro.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ENCRYPTION_KEY não definida. Configure a variável de ambiente em produção para proteger as chaves de IA e de pagamento em repouso."
      );
    }
    return null;
  }
  // Aceita qualquer string; deriva 32 bytes determinísticos via SHA-256.
  return crypto.createHash("sha256").update(raw).digest();
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * Cifra um segredo. Sem ENCRYPTION_KEY definido, retorna o texto puro APENAS
 * em desenvolvimento; em produção a ausência da chave lança erro (fail closed).
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

/** Sentinela enviado pelo SecretInput quando o admin marca "Remover chave". */
export const CLEAR_SECRET = "__CLEAR__";

/**
 * Resolve o valor de um campo de segredo vindo de um formulário, no padrão usado
 * por todas as telas de settings do admin:
 * - vazio        → `{}` (mantém o que já está salvo)
 * - `__CLEAR__`  → `{ [field]: null }` (remove a chave)
 * - qualquer texto → `{ [field]: encryptSecret(texto) }` (cifra e salva)
 */
export function resolveSecretUpdate<K extends string>(field: K, raw: string): Partial<Record<K, string | null>> {
  const value = (raw ?? "").trim();
  if (!value) return {};
  if (value === CLEAR_SECRET) return { [field]: null } as Record<K, null>;
  return { [field]: encryptSecret(value) } as Record<K, string>;
}

/**
 * Mascara um segredo cifrado para exibição: mostra o prefixo + bullets.
 * Retorna null quando não há valor configurado.
 */
export function maskSecret(encrypted: string | null | undefined, prefixLen = 8): string | null {
  if (!encrypted) return null;
  try {
    const plain = decryptSecret(encrypted);
    if (!plain) return null;
    return `${plain.slice(0, prefixLen)}${"•".repeat(12)}`;
  } catch {
    return "••••••••••••";
  }
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
