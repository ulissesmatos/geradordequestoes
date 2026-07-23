import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownContent } from "./src/components/markdown-content";

const content = `Você foi bem: **8/10 (80%)** no último bloco de **Matemática (nível difícil) – Cebraspe (Certo/Errado)**.

Você errou **2 questões**. As duas foram:

- **Função discreta** \\(N(p)=A\\cdot 2^{-p}\\) com \\(N(3)=40\\) e \\(N(5)=10\\) (você marcou CERTO, gabarito ERRADO).
- **Sequência** \\(u_1=1\\) e \\(u_{n+1}=3u_n+4\\) (você marcou CERTO, gabarito ERRADO).

Quer que eu faça uma **revisão focada** só nessas 2 temáticas?`;

const html = renderToStaticMarkup(<MarkdownContent content={content} compact />);
console.log(html.includes("katex") ? "OK: KaTeX renderizou (achou markup do katex no HTML)" : "FALHOU: nenhum markup do katex encontrado");
console.log(html.includes("\\(") ? "ATENÇÃO: ainda sobrou delimitador \\( cru no HTML" : "OK: nenhum delimitador cru sobrando");
console.log("\n--- Trecho do HTML (primeiros 600 chars) ---");
console.log(html.slice(0, 600));
