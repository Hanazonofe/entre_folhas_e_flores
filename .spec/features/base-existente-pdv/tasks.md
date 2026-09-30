# Tasks: Base existente do PDV

> feature: base-existente-pdv

Registro retrospectivo de responsabilidades, sem reconstruir nem reimplementar estas funcionalidades. A regularização foi autorizada pelo usuário e é executada localmente, em sequência. Status indica conferência documental e prova dos critérios referenciados, não autoria ou implementação original.

## T-015 — Mapear autenticação, administração e acesso à api [concluida]

- Refs: US-006, AC-040
- Arquivos: login.html, login.js, admin.html, admin.js, api.js, backend/pdv/__init__.py, backend/pdv/auth.py, backend/pdv/cli.py, backend/pdv/config.py, backend/tests/test_api.py
- Notas: Interface e suporte de autenticação/administração; prova de sessão, autorização e CSRF no servidor.

## T-016 — Mapear histórico e comprovantes de vendas [concluida]

- Refs: US-006, AC-041, AC-047, AC-048
- Arquivos: vendas.html, receipt.html, receipt.js, tests/ui.test.js, backend/tests/test_api.py
- Notas: Consulta e apresentação de vendas; histórico e integridade exercitados na API; comprovante e dependências exercitados nos testes JavaScript.

## T-017 — Mapear cadastro e importação de produtos [concluida]

- Refs: US-006, AC-042, AC-043
- Arquivos: produtos.html, produtos.js, backend/pdv/import_products.py, backend/pdv/product_spreadsheet.py, tests/product-import-ui.test.js, tests/importer/test_import_products.py
- Notas: Prévia e confirmação de planilhas; importação CSV em simulação por padrão.

## T-018 — Mapear banco, migrations e implantação local [concluida]

- Refs: US-006, AC-044
- Arquivos: backend/pdv/db.py, backend/pdv/models.py, backend/migrations/env.py, backend/migrations/script.py.mako, backend/migrations/versions/d8f9e685f9ae_initial_local_shop_schema.py, backend/migrations/versions/e239_integrity.py, backend/migrations/versions/e240_backup_outbox.py, deployment/Caddyfile, deployment/Dockerfile.api, deployment/Dockerfile.caddy, deployment/Dockerfile.test, deployment/caddy-entrypoint.sh, deployment/dev/init-db.sh, deployment/grants.sql, deployment/init-db.sh, deployment/migrate.py, deployment/start.py, scripts/configure.py, scripts/test-compose.py, scripts/test-database.sh, tests/database/test_migrations.py
- Notas: Infraestrutura que suporta a aplicação e o banco; prova automatizada cobre a reconstrução e integridade do schema, não uma implantação em produção.

## T-019 — Mapear backup do servidor e procedimentos de recuperação [concluida]

- Refs: US-006, AC-045
- Arquivos: backend/pdv/backup.py, backend/pdv/restore.py, deployment/Dockerfile.backup, scripts/authorize_drive.py, scripts/test-backup.sh, backend/tests/test_backup.py
- Notas: Fila e retomada de envio verificadas com destino simulado. Restore e autorização externa são ferramentas do mesmo domínio, com procedimentos operacionais em docs/BACKUP.md.

## T-020 — Mapear compatibilidade legada preservada [concluida]

- Refs: US-006, AC-046, AC-048
- Arquivos: backup.js, catalog.js, store.js, tests/backup-ui.test.js, tests/store.test.js, tests/ui.test.js
- Notas: Módulos antigos preservados para consulta e regressão; não carregados pelas páginas atuais.

## T-021 — Mapear configuração e documentação de rastreabilidade [concluida]

- Refs: US-006, AC-040, AC-041, AC-042, AC-043, AC-044, AC-045, AC-046, AC-047, AC-048
- Arquivos: onpspec.config.json, .spec/features/base-existente-pdv/spec.md, .spec/features/base-existente-pdv/tasks.md
- Notas: Manter fontes reais na auditoria e retirar apenas artefatos gerados; verificar critérios e executar audit --ci.
