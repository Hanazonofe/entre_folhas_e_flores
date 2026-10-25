# Projeto técnico — redesenho das telas

> feature: redesign-telas-pdv

## Estrutura visual

Extrair :root de design-system.css para design-tokens.css, carregado antes de ui.css nas telas e antes do CSS do catálogo. Manter o catálogo separado e centralizar estilos operacionais no ui.css. Remover blocos style repetidos nos cinco HTMLs e isolar regras de impressão por body.receipt-page. Sem framework ou recurso externo. Distribuir tokens pela allowlist do backend e pelo wildcard CSS do Dockerfile.

Cabeçalho flexível com logo, navegação e conta. Identificar página ativa por aria-current. Login sem navegação ativa incorreta, com formulário centralizado. Produtos: cadastro e planilha lado a lado no desktop, lista abaixo; uma coluna no celular. Vendas: filtros, resumo e registros expansíveis, edição em dialog nativo. Administração: segurança, usuários e backup separados, com mesma autorização existente.

Caixa em duas colunas acima de 920 px; no mobile manter catálogo apenas com busca e pagamento expansível. Nenhuma mudança em cálculo, requisições, serialização de pagamentos ou recuperação de pedido. Preservar IDs e data attributes usados pela delegação; acrescentar nomes acessíveis aos controles de quantidade.

Comprovante: folha branca em tela; em print usar 72 mm de conteúdo com margem de 4 mm em papel 80 mm (página CSS de 80 × 297 mm, paginável), Arial 11 px, marca textual e estado legível sem cor. Ocultar toolbar e botão; preservar atualização antes da impressão.

## Estados e acessibilidade

Avisos com texto e regiões de status existentes; erros em regiões alert. Foco visível, controles de toque de pelo menos 44 px, textos longos quebráveis. Dialog nativo gerencia contenção de foco e Escape; ao fechar edição, restaurar foco ao botão de edição que pode ser substituído após atualização da lista. Desabilitado não indica sucesso.

## Provas

Testes Node com harness existente para venda e edição; testes de contrato HTML/CSS para navegação, distribuição, contraste e print; testes de interações de cadastro/admin/login em superfícies controladas. Navegador real com API simulada e dados fictícios para todas as telas nas três larguras. Nunca tocar banco operacional. Gates ONP usam a suíte integral e PostgreSQL descartável via script existente.

Auditoria inicial registra conflitos de IDs e provas ausentes preexistentes em outras features; não alterar câmera para esconder problemas. Estados de tarefas e feature permanecem honestos se gate global falhar.
