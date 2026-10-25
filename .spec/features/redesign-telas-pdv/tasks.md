# Tasks: Redesenho das telas do PDV Garden

> feature: redesign-telas-pdv

Execução manual sequencial nesta sessão, sem agentes adicionais e sem mudar modelo ou esforço.

## T-022 — Compartilhar tokens e registrar base visual [concluida]

- Refs: AC-067, AC-074
- Arquivos: design-tokens.css, design-system.css, design-system.html, design-system.js, garden-logo.jpg, ui.css, backend/pdv/app.py, deployment/Dockerfile.api, scripts/deploy-homologation.sh, tests/homologation-deploy.test.js, docs/DESIGN_SYSTEM.md, README.md
- Dependências: Nenhuma
- Notas: Seguir design.md e preservar mudanças preexistentes. Concluir somente após prova do verify.

## T-023 — Refazer navegação, login e diálogos compartilhados [concluida]

- Refs: AC-067, AC-072
- Arquivos: login.html, api.js, ui.css
- Dependências: T-022
- Notas: Seguir design.md e preservar mudanças preexistentes. Concluir somente após prova do verify.

## T-024 — Refazer caixa e preservar fluxo responsivo [concluida]

- Refs: AC-068, AC-069
- Arquivos: pdv.html, pdv.js, ui.css, tests/helpers/pdv-harness.js, tests/pdv-mobile.test.js, test/leitura-automatica-codigo-barras.spec.test.js
- Dependências: T-023
- Notas: Seguir design.md e preservar mudanças preexistentes. Concluir somente após prova do verify.

## T-025 — Refazer cadastro e consulta de produtos [concluida]

- Refs: AC-070
- Arquivos: produtos.html, produtos.js, ui.css
- Dependências: T-024
- Notas: Seguir design.md e preservar mudanças preexistentes. Concluir somente após prova do verify.

## T-026 — Refazer consulta e edição de vendas [concluida]

- Refs: AC-071
- Arquivos: vendas.html, vendas.js, ui.css, tests/admin-payments.test.js
- Dependências: T-025
- Notas: Seguir design.md e preservar mudanças preexistentes. Concluir somente após prova do verify.

## T-027 — Refazer administração e comprovantes [concluida]

- Refs: AC-072, AC-073
- Arquivos: admin.html, admin.js, receipt.html, receipt.js, ui.css
- Dependências: T-026
- Notas: Seguir design.md e preservar mudanças preexistentes. Concluir somente após prova do verify.

## T-028 — Completar provas e auditar integração [em-andamento]

- Refs: AC-067, AC-068, AC-069, AC-070, AC-071, AC-072, AC-073, AC-074
- Arquivos: tests/redesign.test.js, backend/tests/test_design_assets.py, tests/BROWSER-CHECKLIST.md, docs/DESIGN_SYSTEM.md, package.json
- Dependências: T-027
- Notas: Seguir design.md e preservar mudanças preexistentes. Concluir somente após prova do verify.
