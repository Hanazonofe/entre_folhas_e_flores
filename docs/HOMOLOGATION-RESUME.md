# Homologação — registro de retomada em 10/10/2026

Retomada solicitada pelo usuário em 10/10/2026. O estado abaixo registra o ponto
da pausa anterior; os avanços da retomada constam ao final.

## Estado salvo

- Branch local: `infra/homologation-sandbox`, baseada em production `acb6397`.
- Alterações ainda não commitadas nem enviadas; nenhum deploy ou mutação no servidor/GitHub foi realizado nesta implementação.
- Arquivos preparados: `compose.homol.yaml`, `.github/workflows/homologation.yml`, `scripts/configure-homologation.py`, `scripts/deploy-homologation.sh`, `scripts/refresh-homologation.sh`, `backend/pdv/homologation.py`, `backend/tests/test_homologation.py`, ajustes em `backend/pdv/app.py` e `.gitignore`.
- API preparada para indicar ambiente/SHA no health check e inserir faixa de homologação nas páginas HTML, inclusive login e comprovantes.
- Exportação sanitizada por transação READ ONLY; importação protegida para db/pdv_homol e proprietário, com substituição transacional explícita.
- Suíte `scripts/test-onp.sh` concluída com sucesso; ambientes Docker descartáveis removidos. Log: `/tmp/pdv-homol-tests.log` (pode desaparecer ao reiniciar). Sintaxe shell/Python e check JavaScript verificados.
- Primeiro teste falhou por literal de senha em fixture; corrigido sem mudar detector, segunda execução passou.
- Alterações anteriores do usuário em `.spec/verification/sinais.json` e `.spec/features/leitura-camera-mobile/` permanecem preservadas e não pertencem a esta entrega.

## Descobertas do servidor

- SSH `felipe@100.101.186.24` funcionou após uma tentativa inicial lenta.
- Host se identifica como `hanazono`; na tailnet é `garden-prd`.
- LAN: `192.168.18.31/24`; Tailscale: `100.101.186.24`.
- 2 CPUs, 3666 MiB de RAM, cerca de 2431 MiB disponíveis na inspeção; 197 GiB livres em disco.
- Produção: `/home/felipe/entre_folhas_prod`, projeto `entre-folhas-pdv`, health check respondeu ok.
- Homologação existente: `/home/felipe/entre_folhas_homol`, commit `5cdab2f`, checkout limpo; projeto `entre-folhas-pdv-homol`, somente API e DB rodando; API publicada em `8081` nos IPs LAN/tailnet, sem Caddy ativo.
- Secrets antigos: `/home/felipe/entre_folhas_homol_secrets`; produção possui diretório separado.
- Configuração nova usa volumes sandbox novos e credenciais novas; não apagar os volumes antigos.

## Decisões confirmadas

- Sandbox compartilhado, contas individuais, cópia sanitizada incluindo catálogo e histórico de vendas/pagamentos.
- Deploy manual por SHA completo, sem atualização automática da base entre deploys.
- URL `https://entre-folhas-homol.duckdns.org:8443`; DuckDNS aponta a `100.101.186.24`.
- LAN sem Tailscale: entrada hosts apontando ao IP LAN; usuário não administra roteador/DNS, celulares sem Tailscale continuam pendentes.
- Usuário autorizou mudar a branch padrão do GitHub de `main` para `production` APÓS integrar a homologação, para disponibilizar workflow manual. Isso ainda não foi executado.

## Pendências ao retomar

1. Revisar scripts/configuração e ampliar provas de importação transacional (roundtrip, sequência de vendas, rollback e ausência de dados sensíveis nos eventos).
2. Validar Compose efetivo e segurança de portas/secrets/volumes; revisar comportamento de falha de migrations e build com os recursos disponíveis.
3. Documentar operação, recuperação, restauração e promoção; registrar rastreabilidade e audit conforme constituição, sem mascarar pendências locais da câmera mobile.
4. Commitar somente a entrega de homologação, enviar branch, abrir PR e passar CI. Preservar arquivos locais do usuário.
5. Integrar via processo do projeto; mudar branch padrão para production conforme decisão acima. Criar Environment homologation e secret HOMOL_SSH_KNOWN_HOSTS com chave pública verificada; secrets existentes DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY e TS_OAUTH_* foram vistos apenas pelos nomes.
6. Provisionar secrets e `.env.homol-sandbox` no servidor sem exibir valores; usar token DuckDNS da homologação antiga. Instalar pelo workflow e confirmar SHA/HTTPS/banner.
7. Executar atualização sanitizada explícita, validar isolamento/health de produção, dois deploys e falha controlada; testar tailnet e registrar validação LAN que depende de cliente nessa rede.
8. Não declarar ambiente concluído antes da validação e entrega de contas aos solicitantes; não enviar mensagens a terceiros sem autorização explícita.

## Cuidados

- Novos scripts e testes ainda precisam de revisão antes de instalação; não executar diretamente só porque estão salvos.
- Não compartilhar segredos/volumes/backups de produção, não usar down -v no servidor e não executar testes no banco operacional.
- Não converter o retorno a um commit anterior em promessa de rollback de schema.
- Nenhuma tarefa em background permanece ativa após a pausa.

## Avanços em 10/10/2026

- Revisado o início de API/Caddy: `--no-deps` após a migration explícita evita
  uma segunda execução por `depends_on`.
- Testes reais no PostgreSQL descartável provaram roundtrip do histórico,
  sequência de vendas, importação vazia e rollback após falha tardia.
- Acrescentada validação do provisionamento e do Compose efetivo, incluindo
  não sobrescrita de secrets, portas, volumes e redes isoladas.
- Documentação operacional em `docs/HOMOLOGATION.md` e rastreabilidade em
  `.spec/features/homologacao-sandbox/`.
- Acesso SSH confirmado novamente. Autenticação GitHub inicialmente inválida,
  depois restabelecida. PR #9 integrado e branch padrão alterada para production.
- Environment/secrets provisionados; correções de instalação no PR #10.
- Publicação e HTTPS confirmados no workflow 38049420494. Cópia sanitizada
  importada: 2.351 produtos, sete usuários históricos inativos e zero vendas.
  Login de homol-admin e faixas em login/PDV/comprovante validados na tailnet;
  produção saudável após a cópia. Usuário pediu somente o administrador.
- Credenciais entregues fora de Git; segundo deploy confirmado no workflow
  38050109524, SHA inválido recusado no workflow 38050139755, e cliente LAN sem
  Tailscale ainda pendente.
