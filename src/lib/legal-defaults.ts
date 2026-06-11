/**
 * Textos-base (boilerplate) para Termos de Uso e Política de Privacidade.
 * Servem de ponto de partida editável no admin — NÃO substituem revisão jurídica.
 */

export function defaultTermsContent(appName: string): string {
  return `# Termos de Uso

_Última atualização: ${new Date().toLocaleDateString("pt-BR")}_

Bem-vindo(a) ao **${appName}**. Ao criar uma conta e utilizar a plataforma, você concorda com estes Termos de Uso.

## 1. O serviço
O ${appName} é uma plataforma de geração de questões, simulados, revisões e materiais de estudo com auxílio de inteligência artificial, voltada à preparação para concursos públicos.

## 2. Conta e cadastro
Você é responsável por manter a confidencialidade da sua senha e por toda atividade realizada na sua conta. As informações fornecidas no cadastro devem ser verdadeiras e atualizadas.

## 3. Planos, pagamentos e trial
Oferecemos um número gratuito de gerações para experimentação. O acesso completo depende de assinatura paga, cobrada via cartão de crédito ou Pix, conforme o plano escolhido. Os valores e condições vigentes são exibidos na página de planos.

## 4. Conteúdo gerado por IA
As questões e materiais são gerados automaticamente por modelos de inteligência artificial e podem conter imprecisões. O conteúdo tem finalidade exclusivamente educacional e de treino, não constituindo gabarito oficial de nenhuma banca examinadora.

## 5. Uso adequado
É vedado utilizar a plataforma para fins ilícitos, redistribuir o conteúdo comercialmente sem autorização, ou tentar comprometer a segurança do sistema.

## 6. Cancelamento
Você pode cancelar sua assinatura a qualquer momento. O acesso permanece ativo até o fim do período já pago.

## 7. Limitação de responsabilidade
O ${appName} não garante aprovação em concursos e não se responsabiliza por decisões tomadas com base no conteúdo da plataforma.

## 8. Alterações
Estes termos podem ser atualizados. Mudanças relevantes serão comunicadas pelos canais oficiais.

## 9. Contato
Dúvidas sobre estes termos podem ser enviadas pela página de contato.`;
}

export function defaultPrivacyContent(appName: string): string {
  return `# Política de Privacidade

_Última atualização: ${new Date().toLocaleDateString("pt-BR")}_

Esta Política descreve como o **${appName}** trata seus dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).

## 1. Dados que coletamos
- **Cadastro:** nome, e-mail e senha (armazenada de forma criptografada).
- **Dados fiscais (quando necessários para pagamento):** CPF, data de nascimento e telefone.
- **Uso:** histórico de questões, respostas, desempenho e interações com a IA.
- **Pagamento:** processado por parceiros (Stripe e Mercado Pago); não armazenamos os dados completos do seu cartão.

## 2. Finalidade
Utilizamos seus dados para autenticar o acesso, processar pagamentos, personalizar o estudo, emitir comunicações transacionais e cumprir obrigações legais e fiscais.

## 3. Base legal
O tratamento se fundamenta na execução do contrato (prestação do serviço), no cumprimento de obrigação legal e no seu consentimento, quando aplicável.

## 4. Compartilhamento
Compartilhamos dados apenas com provedores essenciais à operação (processadores de pagamento, envio de e-mail e infraestrutura), que devem tratá-los conforme a LGPD. Não vendemos seus dados.

## 5. Segurança
Adotamos medidas técnicas e organizacionais para proteger seus dados, incluindo criptografia de senhas e de segredos sensíveis.

## 6. Seus direitos
Você pode solicitar acesso, correção, portabilidade ou exclusão dos seus dados, bem como revogar consentimentos, pela página de contato.

## 7. Retenção
Mantemos seus dados pelo tempo necessário às finalidades descritas e às obrigações legais. Encerrada a conta, dados fiscais podem ser retidos pelos prazos exigidos por lei.

## 8. Contato do controlador
Para exercer seus direitos ou tirar dúvidas sobre privacidade, utilize a página de contato.`;
}
