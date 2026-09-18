# Entre Folhas e Flores — PDV na rede local

PDV de uma loja com múltiplos operadores, banco PostgreSQL centralizado, API FastAPI e páginas servidas localmente por HTTPS. Logins e vendas independem de internet; conexão ao servidor local é obrigatória. O bot Telegram em `main.py` permanece separado e não foi alterado.

- [Modelo, diagrama e dicionário de dados](docs/MODEL.md)
- [Instalação Linux, Docker e HTTPS local](docs/INSTALL.md)
- [Backup Google Drive e restauração](docs/BACKUP.md)
- [Testes e pendências do piloto](docs/TESTING.md)

Não executar apenas `python -m http.server`: as páginas agora precisam da API. Instalação operacional: seguir INSTALL.md depois da revisão/autorização. Não há usuário/senha padrão, produtos de exemplo ou importação automática. Backups e dados antigos do navegador devem ser preservados para consulta.

Operador registra/consulta/imprime vendas. Administrador gerencia produtos/usuários, edita/cancela/reativa vendas e solicita backups. Autorização no servidor, sessões locais de oito horas, CSRF, rate limit, senhas Argon2id. Pagamentos divididos registram valores informados, sem integração bancária e sem estorno automático. Estoque continua somente cadastral.

Testes JavaScript: `npm test` e `npm run check`. Integração: ambiente PostgreSQL descartável `pdv_test`, instruções em TESTING.md. Parte dos testes JavaScript preserva a regressão do módulo legado do PR #2, que não é carregado nas páginas novas. Nunca apontar testes destrutivos à base operacional.

Entrega em PR para revisão, sem merge/publicação automática. Configuração Google, confiança da CA nos dispositivos, restauração externa real e piloto de dois dispositivos são requisitos antes de entrar em operação.
