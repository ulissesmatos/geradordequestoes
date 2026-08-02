"use client";

import { useEffect } from "react";

const ENDPOINT = "/api/client-errors";
// Teto por carregamento de página: um navegador preso num loop de erro (o motivo de este
// componente existir) não pode virar uma rajada de centenas de beacons — 1 amostra já basta
// pra diagnosticar.
const MAX_REPORTS_PER_LOAD = 5;

function send(payload: { message: string; stack?: string; url: string }) {
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
  } else {
    fetch(ENDPOINT, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
  }
}

/**
 * Sem isto, um erro puramente client-side (ex.: navegador antigo sem um método que uma
 * dependência usa) nunca deixa rastro em lugar nenhum — a página só trava ou pisca em loop
 * pro usuário, e os logs de servidor (Vercel) continuam limpos porque o erro nunca chega
 * a fazer uma requisição. Ver /admin/erros-cliente para os relatos recebidos.
 *
 * Renderizado uma vez no layout raiz — cobre o site inteiro, logado ou não.
 */
export function ClientErrorReporter() {
  useEffect(() => {
    let sent = 0;
    const seen = new Set<string>();

    function report(message: string, stack?: string) {
      if (sent >= MAX_REPORTS_PER_LOAD) return;
      const key = message.slice(0, 200);
      if (seen.has(key)) return; // mesmo erro repetindo (ex.: loop) — 1 amostra basta
      seen.add(key);
      sent += 1;
      send({ message, stack, url: window.location.href });
    }

    function onError(event: ErrorEvent) {
      report(event.message || "Erro desconhecido", event.error?.stack);
    }

    function onRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason ?? "Promise rejeitada");
      report(`unhandledrejection: ${message}`, reason instanceof Error ? reason.stack : undefined);
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
