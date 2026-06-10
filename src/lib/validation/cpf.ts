export function onlyDigits(value: string): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Valida um CPF pelos dígitos verificadores (aceita com ou sem máscara). */
export function isValidCpf(raw: string): boolean {
  const cpf = onlyDigits(raw);
  if (cpf.length !== 11) return false;
  // Rejeita sequências repetidas (00000000000, 11111111111, …).
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calcCheckDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += Number(cpf[i]) * (length + 1 - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  return calcCheckDigit(9) === Number(cpf[9]) && calcCheckDigit(10) === Number(cpf[10]);
}

/** Formata um CPF como 000.000.000-00 (a partir de dígitos ou string com máscara). */
export function formatCpf(raw: string): string {
  const cpf = onlyDigits(raw).slice(0, 11);
  return cpf
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

/** Formata um telefone BR como (00) 00000-0000 / (00) 0000-0000. */
export function formatPhone(raw: string): string {
  const phone = onlyDigits(raw).slice(0, 11);
  if (phone.length <= 10) {
    return phone.replace(/^(\d{2})(\d{4})(\d)/, "($1) $2-$3").replace(/^(\d{2})(\d)/, "($1) $2");
  }
  return phone.replace(/^(\d{2})(\d{5})(\d)/, "($1) $2-$3").replace(/^(\d{2})(\d)/, "($1) $2");
}
