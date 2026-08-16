/**
 * Detecta celular (Android/iOS) para decidir entre o share sheet nativo do SO e o painel de
 * compartilhamento próprio (redes sociais). `navigator.share` sozinho não serve pra essa decisão:
 * Chrome/Edge no Windows e no Mac também implementam Web Share API, então checar só a API
 * acabaria abrindo o share nativo do SO em desktop também, quando o pedido era mostrar o painel ali.
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (typeof uaData?.mobile === "boolean") return uaData.mobile;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function canUseNativeShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function" && isMobileDevice();
}
