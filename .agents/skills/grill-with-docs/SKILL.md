---
name: grill-with-docs
description: Refinamento estruturado de demandas antes da criação de uma Spec. Use quando o usuário invocar /grill ou pedir para explorar, refinar ou esclarecer uma demanda.
---

# Grill With Docs

## Objetivo

Transformar uma necessidade ainda informal em uma demanda suficientemente clara para gerar uma Spec implementável.

O Grill é uma etapa de descoberta.

Não implementar código durante o Grill.
Não criar solução prematuramente.
Não assumir requisitos que ainda não foram decididos.

## Comportamento

Ao iniciar um Grill:

1. Registre a necessidade inicial apresentada pelo usuário.
2. Identifique ambiguidades, premissas e decisões ainda abertas.
3. Faça UMA pergunta por vez.
4. Priorize perguntas que possam alterar comportamento, arquitetura, dados, segurança ou experiência do usuário.
5. Use as respostas anteriores para decidir a próxima pergunta.
6. Não transforme hipóteses em decisões sem confirmação.
7. Quando útil, apresente uma recomendação antes de pedir uma decisão.
8. Evite perguntas técnicas quando o usuário puder responder melhor em termos de comportamento esperado.
9. Não prolongue o Grill quando a demanda já estiver suficientemente definida.

## Classificação das informações

Durante a descoberta, diferencie:

### Necessidade

Problema ou objetivo original apresentado pelo usuário.

### Hipótese

Interpretação ainda não confirmada.

### Decisão

Comportamento explicitamente escolhido ou confirmado.

### Restrição

Limite técnico, operacional ou de negócio que deve ser respeitado.

### Linguagem do domínio

Termos utilizados pelo usuário que devem ser preservados na futura Spec.

## Perguntas

Faça apenas UMA pergunta por interação.

Evite questionários com várias perguntas simultâneas.

Exemplo:

Usuário:

> Quero que o leitor de código de barras funcione sem precisar clicar na busca.

Resposta adequada:

> Entendi que você quer capturar a leitura independentemente do foco atual da tela.
>
> Se o operador estiver digitando manualmente em outro campo, como desconto ou valor recebido, o leitor também deve ser capturado globalmente ou esse campo deve ter prioridade?

A próxima pergunta depende da resposta.

## Recomendações

Quando existirem alternativas relevantes:

1. explique brevemente as opções;
2. apresente vantagens e consequências;
3. faça uma recomendação quando houver base suficiente;
4. deixe a decisão explícita para o usuário.

Não transforme a recomendação automaticamente em decisão.

## ADR

Não criar ADR para decisões triviais ou facilmente reversíveis.

Considere ADR quando a decisão:

- altera significativamente a arquitetura;
- cria dependência estrutural;
- define estratégia persistente de dados;
- afeta segurança;
- é cara ou difícil de reverter.

## Encerramento do Grill

O Grill termina quando:

- o comportamento esperado está claro;
- os principais casos de exceção estão definidos;
- não existem ambiguidades relevantes para implementação;
- as restrições importantes são conhecidas.

Antes de encerrar, apresente um resumo contendo:

- Necessidade
- Decisões
- Restrições
- Casos de exceção
- Linguagem do domínio
- Questões ainda abertas, se existirem

Peça confirmação do usuário.

## Integração com Spec Driven

Depois da confirmação do resumo:

1. não implementar ainda;
2. encaminhar a demanda refinada para o fluxo `onp-spec-driven`;
3. usar as decisões do Grill como entrada para criação da Spec;
4. preservar critérios e linguagem definidos durante a descoberta.

Fluxo esperado:

necessidade
    ↓
/grill
    ↓
descoberta
    ↓
resumo confirmado
    ↓
onp-spec-driven
    ↓
Spec
    ↓
Tasks / Plan
    ↓
implementação
    ↓
testes
    ↓
audit