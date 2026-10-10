# Operação do sandbox de homologação

Status em 10/10/2026: implementação local em revisão. Instalação do novo sandbox,
integração no GitHub, acesso HTTPS e entrega de contas ainda pendentes.

## Isolamento e acesso

O projeto Compose é `entre-folhas-pdv-homol`. O banco `pdv_homol`, as credenciais
e os volumes `sandbox_*` são exclusivos. Apenas o Caddy publica a porta 8443
nos IPv4 LAN e Tailscale configurados; API e PostgreSQL ficam em redes internas.
Não há serviço de backup ou integração com Google Drive nesse sandbox.

A URL prevista é `https://entre-folhas-homol.duckdns.org:8443`. Na tailnet, o nome
aponta para `100.101.186.24`. Na LAN sem Tailscale, o cliente precisa resolver o
mesmo nome para `192.168.18.31`, mantendo o nome no HTTPS. Acesso em celulares sem
Tailscale depende de uma solução DNS disponível nessa rede e continua pendente.

## Provisionamento inicial

No servidor, utilizar o checkout `/home/felipe/entre_folhas_homol` após a
integração da branch. Não reaproveitar credenciais nem volumes de produção.
Executar uma vez, fornecendo o caminho do token DuckDNS da homologação antiga:

```sh
python3 scripts/configure-homologation.py \
  --lan-ip 192.168.18.31 \
  --secrets-dir /home/felipe/entre_folhas_homol_sandbox_secrets \
  --duckdns-token-file CAMINHO_DO_TOKEN_EXISTENTE
```

O script recusa destinos existentes. Cria `.env.homol-sandbox` e senhas novas;
nunca imprimir os arquivos de secrets em logs. O administrador inicial será
`homol-admin`, com a senha guardada em `admin_password`, após a importação.
Criar contas individuais pela aplicação antes de liberar o uso; esse usuário
inicial é destinado ao provisionamento. Os usuários históricos ficam inativos
e recebem hashes de senhas aleatórias.

No GitHub, configurar o Environment `homologation`, os secrets de deploy e
Tailscale já utilizados pelo projeto e `HOMOL_SSH_KNOWN_HOSTS`. A chave pública
SSH deve ser comparada com a chave do host por um canal confiável antes de
cadastrar o secret. O workflow precisa estar na branch padrão para ficar
disponível no acionamento manual.

## Deploy por SHA

Acionar manualmente **Homologation** com o SHA completo de 40 caracteres.
O workflow executa testes e valida o isolamento; o servidor aceita apenas
commits presentes em branches remotas. O build ocorre antes da interrupção do
sandbox. A migration precisa terminar com sucesso antes de iniciar API/Caddy.
Produção não é interrompida. O deploy não atualiza a cópia dos dados.

Um deploy bem-sucedido grava `.homol-release.env`. O health HTTPS deve responder
`status=ok`, `environment=homologation` e o SHA solicitado em `release_sha`.
As páginas, inclusive login e comprovantes, mostram a faixa de homologação.
O primeiro deploy com banco vazio exige a importação explícita abaixo para
criar o administrador e a cópia sanitizada.

## Substituição explícita dos dados

```sh
bash scripts/refresh-homologation.sh SUBSTITUIR-DADOS-HOMOLOGACAO
```

Esse comando substitui todo o conteúdo do sandbox, inclusive contas individuais,
sessões e vendas de teste. Recriar contas individuais após a atualização.
Deploy e atualização compartilham um lock para impedir operações simultâneas.

A exportação de produção usa uma única transação `REPEATABLE READ`, `READ ONLY`.
Somente catálogo e histórico sanitizado passam para um arquivo temporário de
permissão restrita, removido ao final. Identidades são substituídas, hashes não
são exportados, observações são apagadas e snapshots dos eventos usam campos
permitidos. Sessões, idempotência, tentativas de login e backups não são copiados.
Nomes de produtos e códigos permanecem para testar o catálogo e o histórico.

O payload é validado antes de parar o sandbox. A substituição ocorre em uma
transação; uma falha de integridade reverte os dados anteriores. O sandbox fica
parado em caso de falha da importação para permitir inspeção.

## Falhas e recuperação

- Falha de build/configuração: os serviços anteriores continuam rodando; o
  checkout pode já apontar para o candidato. Usar `.homol-release.env` para
  identificar a última versão validada, não apenas `git rev-parse HEAD`.
- Falha de migration: API/Caddy ficam parados. Verificar logs de homologação e
  corrigir a migration antes de publicar novamente. Uma migration já aplicada
  pode ter alterado o schema mesmo que o deploy inteiro tenha falhado.
- Falha do health: a versão candidata pode estar rodando, sem ser registrada
  como última versão validada. Inspecionar containers, certificado e logs.
- Falha de importação: os dados anteriores permanecem. Depois de inspecionar a
  causa, carregar `.homol-release.env` com `set -a` e iniciar somente API/Caddy
  usando `docker compose --env-file .env.homol-sandbox -f compose.homol.yaml up
  -d --no-build --no-deps api web`.

Retornar a um SHA anterior exige verificar compatibilidade do schema. Não há
rollback automático de migrations. Para recuperar dados de teste, uma nova
importação sanitizada é o mecanismo previsto; não restaurar um dump bruto de
produção no sandbox. Os volumes antigos da homologação permanecem preservados.
Nunca executar `down -v` no servidor.

## Validação e promoção

Provas locais: `bash scripts/test-onp.sh`, `npm run check`, `bash -n` nos scripts
e `python3 scripts/test-homologation-config.py`. Os testes conferem remoção de
credenciais/observações, contas inativas, recusa de destinos operacionais,
histórico completo, sequência de vendas, rollback e isolamento do Compose.

Antes de liberar: registrar o SHA, CI, HTTPS, faixa visual, importação, contas
individuais, produção saudável antes/depois, dois deploys e uma falha controlada.
Validar clientes Tailscale e LAN e registrar limitações reais. Essas provas de
instalação ainda não foram executadas para o novo sandbox.

Promover significa integrar o código aprovado pelo processo de produção e
acionar o workflow de produção. Nunca copiar banco, contas ou volumes de
homologação para produção. A especificação da câmera mobile continua pendente
e não faz parte desta implementação.
