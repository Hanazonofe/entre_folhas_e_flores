# Tasks: Sandbox de homologação

> feature: homologacao-sandbox

## T-014 — Sanitizar e importar histórico [em-andamento]
- Refs: US-007, AC-060, AC-061, AC-062, AC-063
- Arquivos: backend/pdv/homologation.py, backend/tests/test_homologation.py, scripts/refresh-homologation.sh
- Dependências: Nenhuma
- Notas: Exportação read only, validação restrita e substituição transacional; provar em banco descartável.

## T-015 — Identificar ambiente e release [em-andamento]
- Refs: US-007, AC-064, AC-065
- Arquivos: backend/pdv/app.py, backend/tests/test_homologation.py
- Dependências: Nenhuma
- Notas: Faixa em HTML e health com SHA.

## T-016 — Provisionar e publicar sandbox isolado [em-andamento]
- Refs: US-007, AC-066
- Arquivos: compose.homol.yaml, scripts/configure-homologation.py, scripts/deploy-homologation.sh, scripts/test-homologation-config.py, tests/homologation-config.test.js, .github/workflows/homologation.yml, .gitignore, docs/HOMOLOGATION.md, docs/HOMOLOGATION-RESUME.md
- Dependências: T-014, T-015
- Notas: CI, integração, Environment, secrets, dois deploys, falha controlada, isolamento de produção e contas individuais ainda precisam de validação no servidor.
