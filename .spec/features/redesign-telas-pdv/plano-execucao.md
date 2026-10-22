# Plano de execução — redesign-telas-pdv

Execução manual sequencial aprovada em 21/10/2026, nesta sessão, com seu modelo e esforço atuais. Sem agentes adicionais, executores headless, mudança de modelo, commits automáticos ou publicação.

T-022 base compartilhada → T-023 acesso e navegação → T-024 caixa → T-025 produtos → T-026 vendas → T-027 administração e comprovante → T-028 provas e auditoria. Todos os arquivos compartilhados são integrados na árvore de trabalho atual preservando mudanças preexistentes.

O gerador ONP foi consultado, mas seu executor padrão propunha outra configuração de modelo e novas sessões. Esta versão manual representa a execução efetivamente autorizada.

Gates: npm run check; npm test; verificação visual real em 360/768/1440 px; onp-spec verify redesign-telas-pdv; onp-spec audit --ci. Usar cópia ESM do motor em /tmp/garden-redesign-onp e ONP_SPEC_HOME temporário, sem modificar o package.json da aplicação por compatibilidade do motor.

Não fechar a feature se faltarem provas ou existirem erros no gate global; registrar a saída e separar bloqueios preexistentes.
