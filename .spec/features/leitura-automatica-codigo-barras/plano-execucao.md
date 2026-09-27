# Plano de execução — leitura-automatica-codigo-barras

> gerado por `onp-spec plano` em 2026-09-27 01:30 — NÃO edite à mão;
> mudou tasks.md ou a config? Regenere: `onp-spec plano leitura-automatica-codigo-barras --sequencial`

## Resumo — o que vai acontecer

- **modo SEQUENCIAL (escolha do usuário)**: 7 tarefa(s) pendente(s), UMA APÓS A OUTRA, na árvore principal
- sem worktrees e sem paralelismo — cada tarefa roda numa janela de contexto limpa, na ordem do tasks.md
- tudo acontece na branch de trabalho `spec/leitura-automatica-codigo-barras`; levar para a main é decisão sua

## Ordem de execução (uma tarefa após a outra)

| tarefa | título | modelo | esforço |
|---|---|---|---|
| T-001 | Preparar runner e harness determinístico | `gpt-5.6-terra` | medium |
| T-002 | Consultar produto pelo código interno exato | `gpt-5.6-terra` | medium |
| T-003 | Implementar classificador temporal e término da leitura | `gpt-5.6-terra` | medium |
| T-004 | Integrar captura e preservar campos da tela | `gpt-5.6-terra` | medium |
| T-005 | Integrar fila e adição protegida ao carrinho | `gpt-5.6-terra` | medium |
| T-006 | Completar provas de aceite e regressões no navegador | `gpt-5.6-terra` | medium |
| T-007 | Validar leitor físico e registrar o gate final | `gpt-5.6-terra` | medium |

## Gestão de branches e commits

1. branch de trabalho `spec/leitura-automatica-codigo-barras` criada do ponto atual (se ainda não existir)
2. as tarefas rodam nela mesma, na ordem — **1 tarefa = 1 commit** (`T-xxx feature: título`), marcada `[concluida]` só com trabalho feito
3. gate final na branch de trabalho: `onp-spec verify leitura-automatica-codigo-barras` + `onp-spec audit --ci` — **exit 0 ou não está pronto**

## Como executar

### ▶ Execução — Codex headless (codex exec)

```bash
bash .spec/features/leitura-automatica-codigo-barras/executar-tarefas.sh
```

Cada tarefa roda `codex exec` com **janela de contexto limpa**, na árvore principal,
uma após a outra, com `--model` e `model_reasoning_effort` já definidos por tarefa e sandbox `workspace-write`.
Os prompts exatos estão embutidos no script.
Logs: `../onp-worktrees/projeto-leitura-automatica-codigo-barras-logs/`.

**Confirmação de custos — antes de executar**: os modelos e esforços por
tarefa estão nas tabelas acima; o agente CONFIRMA com o usuário se estão
dentro da licença/cota dele (modelo forte + esforço alto torra tokens).
Para gastar menos: `onp-spec plano leitura-automatica-codigo-barras --modelo gpt-5.6-luna --esforco baixo`
(tudo) ou por tarefa `onp-spec tarefa leitura-automatica-codigo-barras T-xxx --modelo <m> --esforco <nível>` — e regenere o plano.

### 📣 Acompanhamento — tabela + resumo no chat (a cada 1 min)

O script roda em **background**: o agente AVISA o usuário antes de iniciar e,
enquanto roda, posta no chat a cada ~1 minuto a **tabela de andamento** (qual
tarefa está rodando, qual não está, o que concluiu/falhou) junto com o
**resumo geral de andamento** (escrito por IA; sem IA, o motor resume). Ao
final, o usuário recebe o resumo completo da execução. A qualquer momento:

```bash
onp-spec resumo leitura-automatica-codigo-barras --tabela   # a tabela de andamento
onp-spec resumo leitura-automatica-codigo-barras            # o resumo em texto
```

