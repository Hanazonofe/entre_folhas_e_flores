# CI/CD do PDV — Entre Folhas e Flores

Este documento descreve como usar o fluxo de CI/CD do projeto **Entre Folhas e Flores** no dia a dia.

## 1. Visão geral

O fluxo atual é:

```text
desenvolvimento
      ↓
branch de trabalho
      ↓
Pull Request → production
      ↓
CI
├─ JavaScript
├─ Python + PostgreSQL
└─ Docker Compose
      ↓
merge permitido
      ↓
CI roda novamente em production
      ↓
Deploy production
      ↓
Tailscale → SSH → hanazono
      ↓
Docker Compose
      ↓
health check
      ↓
PDV atualizado
```

A branch `production` é protegida. Push direto para ela é bloqueado pelo GitHub.

---

## 2. Diretórios no servidor

No `hanazono` existem dois diretórios com papéis diferentes:

```text
~/entre_folhas_e_flores
```

Uso: **desenvolvimento**.

É a pasta em que alterações de código podem ser feitas, inclusive pelo Codex.

```text
~/entre_folhas_prod
```

Uso: **produção**.

Essa pasta é atualizada pelo pipeline de deploy e não deve ser usada para desenvolvimento ou alterações manuais de código.

Regra prática:

> Desenvolva em `~/entre_folhas_e_flores`.  
> Não edite código manualmente em `~/entre_folhas_prod`.

---

## 3. Branch de produção

A branch oficial de produção é:

```text
production
```

Ela possui proteção no GitHub e exige:

- Pull Request para receber alterações;
- sucesso no check `JavaScript`;
- sucesso no check `Python + PostgreSQL`;
- sucesso no check `Docker Compose`;
- branch atualizada antes do merge;
- force push desabilitado;
- exclusão da branch desabilitada.

Não faça:

```bash
git push origin production
```

diretamente.

O GitHub deve rejeitar esse push.

---

## 4. Fluxo normal para uma alteração

### 4.1 Criar ou usar uma branch de trabalho

Na pasta de desenvolvimento:

```bash
cd ~/entre_folhas_e_flores
```

Atualize as referências:

```bash
git fetch origin
```

Crie uma branch para a alteração, por exemplo:

```bash
git switch -c feature/minha-alteracao
```

Faça as alterações normalmente.

---

### 4.2 Commitar

Confira:

```bash
git status
```

Adicione os arquivos desejados:

```bash
git add .
```

Crie o commit:

```bash
git commit -m "feat: descreve a alteração"
```

---

### 4.3 Enviar a branch para o GitHub

```bash
git push -u origin feature/minha-alteracao
```

---

### 4.4 Abrir Pull Request

No GitHub, crie um Pull Request com:

```text
base: production
compare: feature/minha-alteracao
```

O Pull Request deve executar três checks:

```text
JavaScript
Python + PostgreSQL
Docker Compose
```

Só faça o merge quando os três estiverem verdes.

---

## 5. O que cada etapa do CI verifica

### JavaScript

Executa os testes e a validação de sintaxe do frontend.

Comandos equivalentes no projeto:

```bash
npm test
npm run check
```

### Python + PostgreSQL

Cria um PostgreSQL descartável chamado `pdv_test`, executa as migrations e roda os testes do backend.

Esse ambiente é separado da base operacional.

O pipeline não deve executar testes destrutivos no banco de produção.

### Docker Compose

Valida a configuração do Docker Compose e os parâmetros necessários para subir a aplicação.

---

## 6. O que acontece depois do merge

Depois que o Pull Request é mergeado na branch `production`, o CI roda novamente.

Se os três checks ficarem verdes, o job:

```text
Deploy production
```

é liberado.

Ele:

1. conecta o GitHub Actions à rede Tailscale;
2. acessa o `hanazono` por SSH;
3. entra em:

```text
/home/felipe/entre_folhas_prod
```

4. busca o commit aprovado;
5. atualiza o checkout de produção;
6. executa:

```bash
docker compose build api migrate
# Caddy é reconstruído se sua infraestrutura mudar ou a imagem local faltar.
docker compose up -d --no-build db migrate api web
```

7. aguarda a aplicação iniciar;
8. chama o endpoint:

```text
/api/health
```

9. considera o deploy concluído somente se o health check responder com sucesso.

O serviço `backup` não faz parte desse deploy atualmente.

Deploys que alteram apenas a aplicação reutilizam a imagem local
`entre-folhas-pdv-caddy`. O pipeline reconstrói o serviço `web` quando a imagem
está ausente ou quando mudam `deployment/Dockerfile.caddy`,
`deployment/caddy-entrypoint.sh`, `.dockerignore`, `compose.yaml` ou
`compose.override.yaml` em relação ao checkout anterior. Isso evita baixar e
compilar novamente as dependências do Caddy/DuckDNS em uma release do PDV.

---

## 7. Banco de dados

Os dados operacionais ficam em volumes Docker e não no diretório Git.

Atualizar o código em:

```text
~/entre_folhas_prod
```

não deve apagar o banco.

Nunca execute comandos como estes sem uma razão explícita e um backup válido:

```bash
docker compose down -v
docker volume rm ...
```

O parâmetro `-v` pode remover volumes e, portanto, dados.

---

## 8. Como conferir a produção

No `hanazono`:

```bash
cd ~/entre_folhas_prod
```

Ver o commit atualmente implantado:

```bash
git rev-parse --short HEAD
```

Ver os containers:

```bash
docker compose ps
```

Testar a aplicação localmente:

```bash
curl   --resolve entre-folhas-pdv.duckdns.org:443:127.0.0.1   -sS   https://entre-folhas-pdv.duckdns.org/api/health
```

Resposta esperada:

```json
{"status":"ok","version":"..."}
```

---

## 9. Recarregar o sistema manualmente

Se for necessário reconstruir ou reiniciar os serviços operacionais:

```bash
cd ~/entre_folhas_prod

docker compose up -d --build   db migrate api web
```

Depois:

```bash
docker compose ps
```

Não inclua `backup` até que o serviço de backup seja revisado e habilitado.

---

## 10. Se o CI falhar

Não faça merge enquanto algum check estiver vermelho.

Abra o workflow em:

```text
GitHub → Actions
```

Identifique o job que falhou:

```text
JavaScript
Python + PostgreSQL
Docker Compose
```

Corrija o problema na branch de trabalho, faça novo commit e push.

O mesmo Pull Request será atualizado e o CI executará novamente.

---

## 11. Se o deploy falhar

Se os testes passarem, mas `Deploy production` falhar:

1. abra o job `Deploy production` no GitHub Actions;
2. identifique em qual etapa ocorreu a falha;
3. não altere manualmente a base de produção para “forçar” o deploy;
4. confira no `hanazono`:

```bash
cd ~/entre_folhas_prod
docker compose ps
```

5. se necessário, veja os logs:

```bash
docker compose logs --tail=100 api web migrate db
```

6. teste o health check:

```bash
curl   --resolve entre-folhas-pdv.duckdns.org:443:127.0.0.1   -sS   https://entre-folhas-pdv.duckdns.org/api/health
```

---

## 12. Segredos e credenciais

Segredos de produção não devem ser commitados no Git.

O diretório de secrets utilizado no servidor é separado do repositório.

Nunca envie para o GitHub:

- senhas do PostgreSQL;
- token do DuckDNS;
- chaves SSH privadas;
- arquivos `.env` com credenciais;
- tokens de APIs;
- credenciais de serviços externos.

---

## 13. Regra de ouro

O caminho normal de uma alteração é:

```text
branch de trabalho
        ↓
Pull Request
        ↓
CI verde
        ↓
merge em production
        ↓
CI verde
        ↓
deploy automático
```

Se uma mudança estiver tentando pular esse caminho, pare e revise antes de colocá-la em produção.

---

## 14. Arquivos do CI/CD

Os workflows ficam no repositório em:

```text
.github/workflows/
```

O pipeline principal está em:

```text
.github/workflows/ci.yml
```

A documentação deste arquivo deve acompanhar mudanças relevantes no pipeline.
