# Spec: Sandbox de homologação

> feature: homologacao-sandbox
> status: em-andamento

## Contexto

Ambiente compartilhado com contas individuais, deploy manual por SHA completo
e atualização explícita de catálogo/histórico sanitizado. Decisões anteriores
estão registradas em docs/HOMOLOGATION-RESUME.md. A implantação real e entrega de
contas permanecem pendentes, conforme docs/HOMOLOGATION.md.

## Histórias

### US-007 — Testar sem alterar produção

Como responsável pela loja, quero um sandbox isolado com dados sanitizados para
validar alterações antes de publicar em produção.

#### AC-060 — Exportar somente dados sanitizados
- **Dado** catálogo e histórico com identidades e observações
- **Quando** a cópia sanitizada é exportada e validada
- **Então** hashes, identidades originais, observações e campos extras de eventos não são copiados e usuários históricos ficam inativos

#### AC-061 — Recusar importação em destino operacional
- **Dado** ambiente, banco, host ou usuário diferentes do sandbox autorizado
- **Quando** uma importação é solicitada
- **Então** ela é recusada antes de conectar ao banco

#### AC-062 — Preservar histórico e sequência
- **Dado** uma cópia sanitizada com vendas, itens, pagamentos e eventos
- **Quando** a importação termina
- **Então** os registros e relacionamentos são preservados e o próximo número de venda supera o maior importado

#### AC-063 — Reverter substituição que falha
- **Dado** um sandbox com dados e sessões existentes
- **Quando** a importação falha após começar a inserir os registros
- **Então** os dados e sessões anteriores permanecem íntegros

#### AC-064 — Identificar o ambiente nas páginas
- **Dado** a aplicação em homologação
- **Quando** login, venda ou comprovante são abertos
- **Então** uma faixa indica que os dados são de teste

#### AC-065 — Identificar o commit publicado
- **Dado** um SHA configurado no ambiente
- **Quando** o health é consultado
- **Então** ele informa homologação e o SHA exato

#### AC-066 — Provisionar recursos exclusivos
- **Dado** destinos novos de configuração e secrets
- **Quando** a configuração é gerada e o Compose resolvido
- **Então** os volumes e secrets são exclusivos, apenas HTTPS é publicado nos IPs previstos e uma segunda geração não sobrescreve credenciais

## Suposições

Nenhuma nova. Acesso LAN em celulares sem Tailscale permanece limitação conhecida.

## Perguntas em aberto

Nenhuma decisão nova; validar a implantação e entregar contas são etapas pendentes.
