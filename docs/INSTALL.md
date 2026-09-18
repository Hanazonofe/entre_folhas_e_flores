# Instalação e operação local

## Antes da instalação

Instalar somente após revisão do PR e autorização para publicação. Preservar os backups JSON existentes em pelo menos dois locais, manter a aplicação antiga separada para consulta e não limpar localStorage. A nova instalação começa **sem usuários, produtos ou vendas**. A rotina administrativa cria apenas o primeiro administrador.

Planejamento inicial para piloto: Linux 64 bits, dois núcleos, 4 GB RAM, SSD com 40 GB livres além do sistema; medir volume/tempo de dump antes de dimensionar produção. Reservar espaço para banco, arquivos pendentes e cópias de sete dias. Queda prolongada de internet acumula arquivos sem limite de retenção para pendentes. O dump temporário e o tar de restauração usam /tmp; dimensionar RAM ou um volume temporário protegido conforme o tamanho real. Considerar nobreak e recuperação automática após retorno da energia, sem compra automática.

Docker Engine e Compose com suporte a secrets, redes internas e `service_completed_successfully`. As imagens PostgreSQL 18/Caddy/Python são fixadas por digest e dependências Python em `backend/requirements.lock`. Atualizações devem alterar pins deliberadamente e repetir testes/restauração. Primeiro build e OAuth exigem internet; guardar/exportar imagens para reinstalar offline.

Reservar o IP do servidor no DHCP ou configurar IP fixo fora da faixa dinâmica. Usar esse IP ou nome DNS resolvido pelo roteador local (sem DNS público). Liberar somente TCP 443 da sub-rede autorizada; sem encaminhamento de portas no roteador. Restringir SSH à manutenção, considerar as regras próprias do Docker no firewall. Banco e API não publicam portas. Relógio do servidor deve estar correto mesmo offline (RTC e sincronização local).

## Configuração

Na raiz do repositório:

```sh
python3 scripts/configure.py --host 192.168.1.20
# Troque pelo IP realmente reservado da loja.
docker compose build
docker compose up -d
```

`configure.py` recusa sobrescrever `.env`/`secrets`. O diretório de segredos tem modo 0700. Arquivos de senha lidos pelo usuário postgres têm modo 0444 **dentro desse diretório protegido** e são montados somente nos contêineres necessários; URLs têm modo 0600. Não movê-los para pasta pública. Docker Compose com fontes em arquivo preserva permissões do host. Não versionar/copiar segredos em PRs. A API lê seu segredo antes de descartar privilégios, executando como UID 10001. O papel do banco continua restrito.

Criar primeiro administrador no terminal local:

```sh
docker compose exec api python -m pdv.cli create-admin administrador
# A senha é solicitada no terminal, não passada na linha de comando.
```

A execução administrativa por `exec` lê o arquivo restrito como root no contêiner, mas usa o papel de banco da API. Recuperar senha localmente:

```sh
docker compose exec api python -m pdv.cli reset-password administrador
```

As sessões desse usuário são revogadas. Não há recuperação por e-mail. Não existe senha padrão. Proteja o acesso Linux/Docker: equivale a controle administrativo.

## HTTPS e dispositivos

Caddy usa `tls internal`; a autoridade e seus certificados ficam no volume persistente `certificates`. Extraia **somente o certificado público raiz**:

```sh
docker compose cp web:/data/caddy/pki/authorities/local/root.crt ./pdv-root.crt
```

Instale esse certificado como autoridade confiável nos computadores/celulares autorizados, conforme o sistema e navegador. Confira a impressão digital por canal local confiável. Nunca distribuir a chave privada da CA nem ignorar avisos do navegador. A CA deve ser aprovada pelo administrador dos dispositivos. Use sempre a origem configurada em PUBLIC_ORIGIN; endereço/porta diferentes são rejeitados para alterações. Testes em localhost HTTP são exclusivamente de desenvolvimento.

## Persistência e reinício

Habilite o serviço Docker na inicialização do Linux conforme a distribuição. Serviços usam `restart: unless-stopped`; migrações são tarefa de execução única. Volumes persistem banco, backups e CA. Nunca usar `docker compose down -v` na instalação operacional. `docker compose restart` não apaga dados. Mudança de credencial no arquivo **não** altera senha de papel já criado; faça rotação administrativa coordenada.

Sem internet, logins, catálogo, vendas e impressão funcionam pela LAN. Sem servidor, não confirmar venda ao cliente: manter a página/carrinho aberto. Pedido já enviado mantém corpo/chave em sessionStorage da aba para consultar o mesmo resultado. Não fechar a aba nem abrir outro caixa para refazer uma venda pendente. Não há operação offline com sincronização posterior. Sem quota/sessionStorage, a interface recusa enviar o fechamento.

## Atualização e recuperação

Parar novas vendas, resolver pedidos pendentes, gerar/verificar backup e guardar versão anterior das imagens. Aplicar a versão revisada, `docker compose up -d --build`, conferir migrações/saúde e fazer venda de piloto. Não fazer downgrade destrutivo para tentar recuperar dados. Restaurar em ambiente isolado conforme BACKUP.md e só trocar a operação em janela autorizada.

Serviços Telegram/arquivos antigos não são iniciados por este Compose. Importação CSV e restauração JSON do sistema antigo não são oferecidas pela nova interface; cadastro administrativo é feito na API. Arquivos legados permanecem no Git para consulta/regressão, não são servidos pelo whitelist da API.
