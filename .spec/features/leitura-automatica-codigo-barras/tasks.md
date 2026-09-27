# Tasks: Leitura automática de código de barras

> feature: leitura-automatica-codigo-barras

A antiga T-001 abrangente foi decomposta nas tarefas abaixo. Todas permanecem
pendentes: esta revisão entrega somente documentação. Ver [design.md](design.md).
Os caminhos listados incluem arquivos futuros; sua ausência nesta fase é esperada.

Sequência recomendada: T-001 → T-002 → T-003 → T-004 → T-005 → T-006 → T-007.
T-002 e T-003 têm potencial de paralelismo após T-001; a recomendação inicial é
sequencial. Escolha de paralelismo, modelos e esforços pertence ao plano posterior,
antes de executar. Nenhuma execução, commit, push ou deploy está autorizado aqui.

## T-001 — Preparar runner e harness determinístico [pendente]

- Refs: US-001, US-002, US-003
- Arquivos: package.json, tests/helpers/pdv-harness.js
- Dependências: Nenhuma
- Notas: Adicionar test/*.test.js ao runner; adaptar formato CommonJS do scaffold somente na etapa de testes em que ele for executado. Criar relógio e API com promessas controladas; documentar que scaffolds ainda falham. Não relaxar gates.

## T-002 — Consultar produto pelo código interno exato [pendente]

- Refs: AC-003, AC-004, AC-006, AC-011
- Arquivos: backend/pdv/app.py, backend/tests/test_product_barcode.py
- Dependências: T-001
- Notas: Filtro code exato, preservando zeros; consultar ativos e inativos para distinguir avisos; não fazer fallback para barcode. Cobrir contrato em banco isolado.

## T-003 — Implementar classificador temporal e término da leitura [pendente]

- Refs: AC-001, AC-006, AC-008, AC-009
- Arquivos: barcode-scanner.js, tests/barcode-scanner.test.js
- Dependências: T-001
- Notas: Mínimo cinco dígitos; parâmetros injetáveis; silêncio sem Enter, finalização única e proteção de sufixo. Testar limites sem tempo real.

## T-004 — Integrar captura e preservar campos da tela [pendente]

- Refs: AC-001, AC-003, AC-005, AC-008, AC-009, AC-012
- Arquivos: pdv.js, pdv.html, payments.js, backend/pdv/app.py, package.json, test/leitura-automatica-codigo-barras.spec.test.js, tests/helpers/pdv-harness.js
- Dependências: T-002, T-003
- Notas: Captura global e bloqueio por dialog; busca única; retirar adição por Enter; preservação textual e edição numérica provisória sem efeito financeiro. payments.js só muda se necessário para interceptar/confirmar efeitos. Publicar script em SAFE_FILES e check.

## T-005 — Integrar fila e adição protegida ao carrinho [pendente]

- Refs: AC-002, AC-004, AC-007, AC-010, AC-011, AC-013, AC-014
- Arquivos: pdv.js, pdv.html, test/leitura-automatica-codigo-barras.spec.test.js, tests/helpers/pdv-harness.js
- Dependências: T-004
- Notas: FIFO sem usar busy para consulta; addProduct comum; geração para respostas antigas; bloqueio temporário de conferência/fechamento; cancelar com aviso ao abrir diálogo. Preservar mensagens contra respostas da busca.

## T-006 — Completar provas de aceite e regressões no navegador [pendente]

- Refs: US-001, US-002, US-003, AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011, AC-012, AC-013, AC-014
- Arquivos: test/leitura-automatica-codigo-barras.spec.test.js, tests/barcode-scanner.test.js, tests/helpers/pdv-harness.js, backend/tests/test_product_barcode.py, docs/TESTING.md
- Dependências: T-005
- Notas: Converter scaffolds em testes reais com tags preservadas e novos ACs; cada tarefa anterior acompanha seus testes e esta fecha lacunas. Verificar edição/seleção/composição/Enter em navegador, além de mocks. Rodar suíte pertinente sem base operacional.

## T-007 — Validar leitor físico e registrar o gate final [pendente]

- Refs: US-001, US-002, US-003, AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011, AC-012, AC-013, AC-014
- Arquivos: docs/TESTING.md, .spec/verification/leitura-automatica-codigo-barras.json
- Dependências: T-006
- Notas: Registrar piloto real, parâmetros efetivos e limitações; executar verify e audit --ci. Sem hardware, manter pendente e não alegar prova física. Falhas globais de rastreabilidade preexistentes devem ser reportadas, nunca mascaradas.
