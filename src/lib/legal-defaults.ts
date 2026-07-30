/**
 * Textos-base para Termos de Uso e Política de Privacidade.
 * Servem de ponto de partida editável no admin — NÃO substituem revisão jurídica.
 *
 * Os dados da empresa (razão social, CNPJ, e-mail de suporte, encarregado LGPD, comarca)
 * vêm de AppSetting e são preenchidos em Admin → Branding. Regra central: campo vazio
 * OMITE a frase/seção correspondente. Nunca renderize placeholder entre colchetes — a versão
 * anterior publicava "[NOME DO ENCARREGADO/DPO]" literalmente em /privacidade.
 */

/** Data da última revisão do texto-base. Fixa de propósito: usar `new Date()` fazia o documento
 * alegar "atualizado hoje" em toda visita, o que é falso e desgasta a confiança no documento. */
const LEGAL_DOCS_UPDATED_AT = new Date("2026-07-29T00:00:00Z");

export type LegalIdentity = {
  appName: string;
  legalEntityName?: string | null;
  legalEntityCnpj?: string | null;
  supportEmail?: string | null;
  dpoName?: string | null;
  dpoEmail?: string | null;
  legalVenueCity?: string | null;
};

/** Extrai a identidade legal do AppSetting, para os dois documentos consumirem o mesmo formato. */
export function legalIdentityFrom(settings: {
  appName: string;
  legalEntityName?: string | null;
  legalEntityCnpj?: string | null;
  supportEmail?: string | null;
  dpoName?: string | null;
  dpoEmail?: string | null;
  legalVenueCity?: string | null;
}): LegalIdentity {
  return {
    appName: settings.appName,
    legalEntityName: settings.legalEntityName,
    legalEntityCnpj: settings.legalEntityCnpj,
    supportEmail: settings.supportEmail,
    dpoName: settings.dpoName,
    dpoEmail: settings.dpoEmail,
    legalVenueCity: settings.legalVenueCity
  };
}

function clean(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatUpdatedAt() {
  return LEGAL_DOCS_UPDATED_AT.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/** Identificação de quem responde pelo serviço. Sem razão social, cai para o nome comercial. */
function controllerLabel(identity: LegalIdentity) {
  const name = clean(identity.legalEntityName);
  const cnpj = clean(identity.legalEntityCnpj);
  if (!name) return `**${identity.appName}**`;
  return cnpj ? `**${name}**, inscrita no CNPJ nº ${cnpj}` : `**${name}**`;
}

/** Canal de contato: e-mail quando configurado, senão só a página de contato. */
function contactSentence(identity: LegalIdentity, prefix: string) {
  const email = clean(identity.supportEmail);
  return email
    ? `${prefix} **${email}** ou pela página de contato da plataforma.`
    : `${prefix} a página de contato da plataforma.`;
}

export function defaultTermsContent(identity: LegalIdentity): string {
  const { appName } = identity;
  const venue = clean(identity.legalVenueCity);

  // Sem comarca definida, ficamos só com a lei brasileira + foro do consumidor (CDC), que é a
  // regra que prevalece de qualquer forma em relação de consumo.
  const venueSection = venue
    ? `Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca de **${venue}** para dirimir controvérsias, ressalvada a competência do foro do domicílio do consumidor, nos termos do Código de Defesa do Consumidor.`
    : `Estes Termos são regidos pelas leis da República Federativa do Brasil. Nas relações de consumo, é competente o foro do domicílio do consumidor, nos termos do Código de Defesa do Consumidor.`;

  return `# Termos de Uso

_Última atualização: ${formatUpdatedAt()}_

Bem-vindo(a) ao **${appName}** ("nós", "Plataforma"), serviço operado por ${controllerLabel(identity)}. Ao criar uma conta e utilizar a plataforma, você ("Usuário") declara que leu, compreendeu e concorda com estes Termos de Uso. Se não concordar, não utilize o serviço.

## 1. O serviço
O ${appName} é uma plataforma online de estudos para concursos públicos que oferece geração de questões, simulados, revisões personalizadas e materiais de estudo com auxílio de inteligência artificial, além de chat com assistente de IA, biblioteca de questões e acompanhamento de desempenho.

O serviço é prestado "no estado em que se encontra", podendo ser aprimorado, alterado ou ter funcionalidades adicionadas ou removidas a qualquer tempo, preservados os direitos dos assinantes durante o período já pago.

## 2. Elegibilidade e conta
2.1. Para utilizar a plataforma, você deve ter ao menos **18 anos** ou ser civilmente capaz nos termos da lei brasileira. Menores de 18 anos somente poderão utilizar o serviço com consentimento e supervisão dos pais ou responsáveis legais, que assumem integral responsabilidade pelo uso.

2.2. As informações fornecidas no cadastro (nome, e-mail, CPF, telefone, data de nascimento) devem ser verdadeiras, exatas e atualizadas. Cadastros com dados falsos podem ser suspensos ou excluídos.

2.3. Você é o único responsável pela confidencialidade da sua senha e por toda atividade realizada na sua conta. Comunique-nos imediatamente qualquer uso não autorizado.

2.4. A conta é pessoal e intransferível. O compartilhamento de credenciais com terceiros constitui violação destes Termos e pode resultar em suspensão sem reembolso.

## 3. Planos, pagamentos e período de teste
3.1. Oferecemos uma quantidade limitada de usos gratuitos da inteligência artificial por mês para experimentação ("trial"), renovada mensalmente. O acesso completo depende de assinatura paga.

3.2. Os pagamentos são processados por parceiros (Stripe e Mercado Pago), via cartão de crédito ou Pix, conforme o plano escolhido. Os valores, periodicidade e condições vigentes são os exibidos na página de planos no momento da contratação.

3.3. As assinaturas contratadas por cartão são renovadas automaticamente ao fim de cada ciclo, salvo cancelamento prévio pelo Usuário. Contratações via Pix concedem acesso por prazo determinado, sem renovação automática.

3.4. Podemos alterar os preços dos planos mediante comunicação prévia. A alteração não afeta o período já pago e você poderá cancelar antes da renovação.

3.5. Cupons de desconto, quando disponibilizados, seguem as condições informadas na própria campanha (validade, limite de usos e se o desconto incide apenas na primeira cobrança ou em todo o ciclo).

3.6. Planos empresariais ("teams") contratados por instituições de ensino ou cursinhos seguem condições específicas acordadas com a instituição contratante, incluindo número de vagas e vigência.

## 4. Direito de arrependimento e reembolso
4.1. Nos termos do art. 49 do Código de Defesa do Consumidor, você pode desistir da contratação no prazo de **7 (sete) dias corridos** a contar da contratação, com reembolso integral do valor pago.

4.2. Após esse prazo, o cancelamento interrompe as renovações futuras, mas não gera reembolso proporcional do período em curso, permanecendo o acesso ativo até o fim do período já pago.

4.3. ${contactSentence(identity, "Solicitações de reembolso devem ser feitas por")}

## 5. Conteúdo gerado por inteligência artificial
5.1. As questões, simulados, revisões, materiais e respostas do chat são gerados automaticamente por modelos de inteligência artificial e **podem conter erros, imprecisões ou informações desatualizadas**.

5.2. O conteúdo tem finalidade exclusivamente educacional e de treino. **Não constitui gabarito oficial, posição de banca examinadora, aconselhamento jurídico ou garantia de correção**. Sempre confira informações críticas (editais, datas, legislação) nas fontes oficiais.

5.3. As questões geradas são inspiradas no estilo de bancas examinadoras, mas são originais. Não reproduzimos intencionalmente conteúdo protegido por direitos autorais nem provas na íntegra.

5.4. Você pode utilizar o conteúdo gerado para seu estudo pessoal. É vedada a revenda, redistribuição comercial ou disponibilização pública em massa do conteúdo sem autorização expressa.

## 6. Uso adequado
É vedado ao Usuário:
- utilizar a plataforma para fins ilícitos ou em violação a estes Termos;
- tentar burlar limites de uso, sistemas de segurança, autenticação ou controle de assinatura;
- realizar engenharia reversa, raspagem de dados (scraping) ou acesso automatizado não autorizado;
- enviar conteúdo ilegal, ofensivo ou que viole direitos de terceiros (inclusive em arquivos anexados ao chat);
- revender, sublicenciar ou explorar comercialmente o serviço ou o conteúdo gerado sem autorização;
- sobrecarregar intencionalmente a infraestrutura da plataforma.

A violação destas regras pode resultar em advertência, suspensão ou exclusão da conta, sem prejuízo das medidas legais cabíveis.

## 7. Propriedade intelectual
7.1. A marca, o software, o design, o banco de questões e demais elementos da plataforma pertencem ao ${appName} ou a seus licenciantes e são protegidos pela legislação de propriedade intelectual.

7.2. Estes Termos não transferem ao Usuário qualquer direito de propriedade intelectual sobre a plataforma.

## 8. Disponibilidade do serviço
Empregamos esforços razoáveis para manter a plataforma disponível, mas não garantimos operação ininterrupta ou livre de erros. Manutenções programadas, falhas de terceiros (provedores de IA, pagamento e infraestrutura) e eventos de força maior podem causar indisponibilidades temporárias.

## 9. Limitação de responsabilidade
9.1. O ${appName} é uma ferramenta de apoio aos estudos. **Não garantimos aprovação em concursos** nem nos responsabilizamos por decisões tomadas com base no conteúdo da plataforma.

9.2. Na máxima extensão permitida pela lei, nossa responsabilidade total por danos relacionados ao serviço fica limitada ao valor pago pelo Usuário nos 12 (doze) meses anteriores ao evento.

9.3. Nada nestes Termos exclui ou limita direitos do consumidor que não possam ser excluídos ou limitados por lei.

## 10. Encerramento de conta
10.1. Você pode encerrar sua conta a qualquer momento pelos canais de contato.

10.2. Podemos suspender ou encerrar contas que violem estes Termos, mediante comunicação, salvo em casos graves que exijam ação imediata.

10.3. Encerrada a conta, dados pessoais serão tratados conforme a Política de Privacidade, observados os prazos legais de retenção.

## 11. Alterações destes Termos
Estes Termos podem ser atualizados periodicamente. Mudanças relevantes serão comunicadas pelos canais oficiais (e-mail cadastrado ou aviso na plataforma) com antecedência razoável. O uso continuado após a vigência das alterações constitui concordância.

## 12. Legislação aplicável e foro
${venueSection}

## 13. Contato
${contactSentence(identity, "Dúvidas sobre estes Termos podem ser enviadas para")}`;
}

export function defaultPrivacyContent(identity: LegalIdentity): string {
  const { appName } = identity;
  const dpoName = clean(identity.dpoName);
  const dpoEmail = clean(identity.dpoEmail);
  const supportEmail = clean(identity.supportEmail);

  // Só afirma ter encarregado nomeado quando existe um de fato; caso contrário aponta o canal
  // geral, sem inventar cargo nem deixar lacuna visível.
  const dpoLines = [
    dpoName ? `Encarregado pelo tratamento de dados pessoais: **${dpoName}**` : "",
    dpoEmail
      ? `Contato para assuntos de privacidade e exercício de direitos: **${dpoEmail}**`
      : supportEmail
        ? `Contato para assuntos de privacidade e exercício de direitos: **${supportEmail}**`
        : "Para assuntos de privacidade e exercício de direitos, utilize a página de contato da plataforma."
  ]
    .filter(Boolean)
    .join("\n\n");

  return `# Política de Privacidade

_Última atualização: ${formatUpdatedAt()}_

Esta Política de Privacidade descreve como ${controllerLabel(identity)}, responsável pelo **${appName}** e na qualidade de **controladora de dados**, coleta, utiliza, armazena e protege seus dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD) e o Marco Civil da Internet (Lei nº 12.965/2014).

## 1. Dados que coletamos

**Dados de cadastro**
- Nome completo, e-mail e senha (armazenada exclusivamente na forma de hash criptográfico — nunca em texto puro).
- Quando você entra com o Google, recebemos nome, e-mail e foto de perfil associados à sua conta Google.
- Data e hora do aceite dos Termos de Uso e desta Política.

**Dados fiscais e de pagamento**
- CPF, data de nascimento e telefone, coletados quando necessários para emissão de cobranças (especialmente Pix) e cumprimento de obrigações fiscais.
- Os dados completos de cartão de crédito são coletados e armazenados **exclusivamente pelos processadores de pagamento** (Stripe e Mercado Pago); não temos acesso ao número completo do seu cartão.
- Para participantes do programa de afiliados: chave Pix informada para recebimento de comissões.
- Para planos empresariais: nome, e-mail, telefone e CPF/CNPJ do contratante e CPF dos participantes indicados.

**Dados de uso e estudo**
- Histórico de questões geradas e respondidas, acertos e erros, desempenho por matéria, materiais criados, conversas com o assistente de IA e arquivos anexados ao chat (imagens e PDFs).
- Preferências de estudo, como os estados (UFs) de interesse para concursos e metas diárias.

**Dados técnicos**
- Registros de acesso (logs), endereço IP, data e hora, conforme exigido pelo Marco Civil da Internet.
- Cookies estritamente necessários ao funcionamento: autenticação de sessão, preferências de interface (por exemplo, estado do menu lateral) e, quando você chega por um link de afiliado, um cookie de atribuição com validade de 30 dias. **Não utilizamos cookies de publicidade ou rastreamento de terceiros.**

## 2. Para que usamos os dados (finalidades)
- Autenticar seu acesso e manter sua sessão segura;
- Prestar o serviço contratado: gerar questões, materiais e respostas personalizadas com IA, inclusive considerando seu histórico de desempenho e preferências de estudo;
- Processar pagamentos, emitir cobranças e cumprir obrigações fiscais e contábeis;
- Enviar comunicações transacionais (verificação de e-mail, recuperação de senha, avisos de cobrança, lembretes de revisão e resumos de desempenho, dos quais você pode se descadastrar);
- Prevenir fraudes, abusos e violações dos Termos de Uso;
- Apurar e pagar comissões do programa de afiliados;
- Cumprir obrigações legais e regulatórias;
- Melhorar a plataforma a partir de dados de uso agregados.

## 3. Bases legais (art. 7º da LGPD)
- **Execução de contrato**: prestação do serviço contratado (cadastro, geração de conteúdo, histórico de estudo);
- **Cumprimento de obrigação legal**: retenção de dados fiscais e registros de acesso;
- **Legítimo interesse**: prevenção a fraudes e melhoria do serviço, sempre respeitando suas expectativas razoáveis;
- **Consentimento**: hipóteses específicas, quando solicitado, podendo ser revogado a qualquer momento.

## 4. Compartilhamento com terceiros (operadores)
Compartilhamos dados apenas com fornecedores essenciais à operação, que os tratam sob nossas instruções e conforme a LGPD:

- **Processadores de pagamento**: Stripe e Mercado Pago (dados fiscais e de transação);
- **Provedores de inteligência artificial**: o conteúdo das suas mensagens no chat, os arquivos anexados e um resumo do seu desempenho são enviados ao provedor de IA configurado (OpenAI, Anthropic ou OpenRouter, conforme a configuração vigente) exclusivamente para gerar as respostas e conteúdos solicitados;
- **Busca na web pela IA**: quando o assistente precisa de informação atual (por exemplo, um edital recente), os termos de busca são enviados ao serviço de busca Tavily. Não enviamos seus dados de cadastro nessa consulta;
- **Armazenamento de arquivos**: os anexos do chat são armazenados em acesso privado na Vercel Blob;
- **Infraestrutura e hospedagem**: provedores de nuvem e banco de dados;
- **Envio de e-mail transacional**: Brevo ou Resend, conforme a configuração vigente (nome e e-mail do destinatário).

Alguns desses fornecedores estão localizados no exterior, caracterizando **transferência internacional de dados** (art. 33 da LGPD), realizada com salvaguardas adequadas, como cláusulas contratuais e padrões reconhecidos de segurança.

**Não vendemos nem alugamos seus dados pessoais.** Dados poderão ser fornecidos a autoridades públicas mediante obrigação legal ou ordem judicial.

## 5. Segurança da informação
Adotamos medidas técnicas e organizacionais proporcionais aos riscos, incluindo:
- Senhas armazenadas com hash criptográfico forte;
- Criptografia de segredos e chaves sensíveis em repouso;
- Comunicação cifrada (HTTPS/TLS);
- Controle de acesso por perfil (usuário/administrador) e registro de ações administrativas;
- Limitação de acesso interno aos dados ao estritamente necessário.

Nenhum sistema é 100% seguro. Em caso de incidente de segurança com risco relevante, comunicaremos os titulares afetados e a Autoridade Nacional de Proteção de Dados (ANPD), conforme o art. 48 da LGPD.

## 6. Retenção e exclusão
- Dados de conta e de estudo: mantidos enquanto a conta estiver ativa;
- Após o encerramento da conta: excluídos ou anonimizados, salvo o que devamos reter por obrigação legal;
- Dados fiscais e de transação: retidos pelo prazo de **5 anos** (obrigações fiscais) ou outro prazo legal aplicável;
- Registros de acesso: retidos por no mínimo **6 meses** (art. 15 do Marco Civil da Internet).

## 7. Seus direitos como titular (art. 18 da LGPD)
Você pode solicitar, a qualquer momento e gratuitamente:
- **Confirmação** da existência de tratamento e **acesso** aos seus dados;
- **Correção** de dados incompletos, inexatos ou desatualizados;
- **Anonimização, bloqueio ou eliminação** de dados desnecessários ou excessivos;
- **Portabilidade** dos dados a outro fornecedor;
- **Eliminação** dos dados tratados com base no consentimento;
- **Informação** sobre compartilhamentos realizados;
- **Revogação do consentimento**, quando essa for a base legal;
- **Revisão de decisões automatizadas** que afetem seus interesses.

As solicitações serão respondidas nos prazos da LGPD. Caso entenda que seus direitos não foram atendidos, você pode apresentar reclamação à **ANPD** (gov.br/anpd).

## 8. Cookies
Utilizamos apenas cookies essenciais:
- **Sessão/autenticação**: manter você conectado com segurança;
- **Preferências de interface**: lembrar configurações como o estado do menu lateral;
- **Atribuição de afiliado**: quando você chega por um link de indicação, por 30 dias.

Você pode gerenciá-los nas configurações do navegador; o bloqueio dos cookies essenciais pode impedir o funcionamento da plataforma.

## 9. Crianças e adolescentes
A plataforma destina-se a maiores de 18 anos. Não coletamos intencionalmente dados de crianças. O uso por adolescentes exige consentimento e supervisão dos responsáveis legais, conforme os Termos de Uso.

## 10. Alterações desta Política
Esta Política pode ser atualizada para refletir mudanças no serviço ou na legislação. Alterações relevantes serão comunicadas pelos canais oficiais. A data da última atualização consta no topo do documento.

## 11. Encarregado de dados (DPO) e contato
${dpoLines}`;
}
