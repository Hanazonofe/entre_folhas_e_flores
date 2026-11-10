# Protótipo de câmera em homologação

Acesso: https://entre-folhas-homol.duckdns.org:8443/camera-prototipo.html

No celular, toque em Abrir câmera e autorize o acesso. Posicione as barras na faixa
central, ajustando distância e iluminação. EAN-13 e Code 128 habilitados; QR ignorado.
O mesmo código fica bloqueado até usar “Retirei a etiqueta: liberar nova leitura”
ou iniciar outra sessão. A retirada automática ainda não está implementada.
Sem consulta ao cadastro e sem alteração de vendas. Imagens processadas no aparelho.

Teste etiqueta parada, retirada/reapresentação, produtos distintos, reflexos,
permissão negada, fechar/reabrir e trocar de aplicativo. Registre aparelho, OS,
navegador, código, resultado e disponibilidade do som.

Decoder: @zxing/library 0.23.0 UMD, pacote oficial npm. Licenças Apache-2.0 e MIT
da dependência ts-custom-error em camera-decoder.LICENSE.txt. Comentários mantidos;
EMPTY_TOKEN renomeado para EMPTY_AZTEC_SYMBOL por falso positivo do detector de
credenciais; referência ao source map removida. Pacote original SHA-256:
e49f1076d9af70179c9fbb5026cda67e48864f3bced64fff548237208cc2ff32.

Verificações: npm test; npm run check. Testes específicos:
node tests/camera-prototipo.test.js. Câmera real Android/iPhone pendente.
Não representa conclusão dos critérios de aceite da feature mobile.

## Ajustes após teste de etiqueta — versão 2

Foto reportada pelo operador decodificada como EAN-13 7896004762098 usando o
mesmo bundle. Sucesso com imagem inteira, faixa central e recorte da etiqueta;
confirmado também com HTMLCanvasElementLuminanceSource sobre os pixels RGBA.
A foto não foi incorporada ao repositório nem enviada a serviços de leitura.
Isso não identifica a causa da falha na câmera ao vivo.

Prévia passa a respeitar a proporção real do vídeo, evitando desalinhamento
da guia em retrato; análise alterna faixa e quadro inteiro, preserva até 1920
pixels de largura e solicita captura 1920×1080 preferencial. Foco contínuo é
solicitado apenas quando anunciado pela câmera; falha não interrompe a leitura.
Resolução e contador de quadros aparecem para diagnóstico. Sem leitura, há
orientação para distância/luz.

Comparação por foto: selecionar arquivo até 20 MB, processamento local em canvas
limitado a 2560 pixels no lado maior, resultado separado do histórico ao vivo,
URL temporária liberada após uso. A captura é fechada antes da análise. Recursos
de controlador e CSS recebem parâmetro de versão para evitar cache antigo.
Teste ao vivo no aparelho continua pendente.

Relato refinado: Samsung Galaxy S24, Chrome, prévia normal e etiqueta fora de
foco, sem mensagem de erro. Versão 3 acrescenta seleção das câmeras expostas
pelo navegador após permissão e modo de foco informado em getSettings quando
disponível. Nenhuma suposição de modelo/ID de lente. Troca encerra stream anterior
e abre sessão nova; indisponibilidade permite voltar à seleção automática.
O ajuste de foco segue os recursos anunciados em getCapabilities e a especificação
https://www.w3.org/TR/image-capture/. Não comprova solução do foco no S24 sem
novo teste do operador.

## Versão 4 — câmera abre sem reconhecer

Novo relato do operador: captura abre, sem leitura; ainda sem informação sobre
contador, nitidez ou resultado por foto. A causa no aparelho permanece não
confirmada. Identificada dependência de inicialização: loop aguardava ajuste
opcional de foco. Aplicação de foco agora assíncrona e não bloqueia o leitor;
teste cobre driver que nunca resolve applyConstraints.

API nativa BarcodeDetector é complemento opcional do ZXing: detecção de
getSupportedFormats, somente ean_13/code_128, no máximo uma solicitação pendente
por sessão, sem bloquear o loop JS. Falha, ausência de suporte ou chamada nativa
pendente mantém ZXing disponível. Resultados após fechar/rearmar são ignorados;
QR é filtrado tanto na configuração quanto na saída. Não é dependência para
Android/iPhone nem confirmação de suporte real. Referência primária:
https://wicg.github.io/shape-detection-api/.

Diagnóstico mostra motor disponível e permite mostrar cópia do último quadro
que o controlador desenhou para análise. Imagem fica só na memória da página.
Nenhuma transmissão, persistência ou consulta de cadastro. Não alegar solução
no aparelho antes de novo teste do operador.

## Versão 5 — carregamento de foto compatível com CSP

Arquivo 87993.jpg recebido do operador (960×1280) decodificado localmente pelo
mesmo bundle e adaptador HTMLCanvasElementLuminanceSource sobre RGBA como
7896004762098 / EAN_13. SHA-256 do JPEG:
c4617ef281a270226eb352d5f0fbb7251dd336b8c061fcca9d6593de74159c5f.
Encontrada incompatibilidade concreta: URL.createObjectURL produzia blob:,
mas o middleware serve img-src 'self' data:, bloqueando a imagem antes do decode.
Carregamento substituído por FileReader.readAsDataURL; política mantida intacta.
Teste de upload agora rejeita blob: no carregamento da imagem simulada.
A correção diz respeito à foto; não demonstra solução da câmera ao vivo.

## Capturas para análise — versão 6

Toque em “Capturar imagens para análise” e salve pelos três links: PNG original
completo da câmera, PNG do último quadro analisado pelo leitor e diagnóstico JSON.
Os downloads ficam no aparelho; envie os três arquivos juntos para análise.
O original é capturado no clique e o quadro do leitor pode ser de instante anterior.
O diagnóstico inclui data, dimensões, foco informado e configurações da câmera.
Fechar a câmera preserva os links; recarregar a página os perde. Capture e salve
antes de fechar a página. Se o navegador abrir a imagem, use salvar/compartilhar.
Não há upload nem persistência no servidor. Downloads reais no celular precisam
de validação pelo operador. Publicação isolada baseada na versão já em homologação.

## Identificação da câmera — versão 7

A tela compara a câmera escolhida e o dispositivo informado pelo navegador.
Preserva a escolha no seletor mesmo em caso de divergência, informa seleção
confirmada, divergente ou impossível de confirmar e compara com a sessão anterior.
O JSON registra escolha, identificador e nome efetivos, dispositivo anterior,
lista enumerada, capacidades e constraints disponíveis. Identificador igual ou
diferente não comprova qual lente física de um dispositivo lógico está em uso.
Teste no celular: selecionar cada opção, aguardar o aviso, capturar e salvar os
três arquivos. Câmera automática não recebe confirmação de escolha explícita.

## Versão 8 — troca efetiva

Seleção chama diretamente a abertura em vez de clicar no botão desabilitado.
Teste reproduz botão desabilitado e troca traseira/frontal, validando solicitação,
stream anterior encerrado e diagnóstico da câmera aberta.

## Versão 8 — troca efetiva

Seleção chama diretamente a abertura em vez de clicar no botão desabilitado.
Teste reproduz botão desabilitado e troca traseira/frontal, validando solicitação,
stream anterior encerrado e diagnóstico da câmera aberta.

## Versão 9 — lembrar câmera validada

Operador confirmou em 08/11/2026 foco adequado e leitura bem-sucedida com
“camera 0, facing back”, incluindo outras etiquetas. Evidência é relato de uso,
sem presumir formatos, quantidade ou validação em iPhone.
Seleção explícita confirmada é persistida por deviceId no localStorage deste
navegador/origem. Não fixa o nome camera 0 para outros aparelhos. Na primeira
visita, escolher a câmera validada; nas próximas, Abrir câmera usa a preferência.
Não abre câmera automaticamente. Seleção manual continua disponível.
Preferência ausente retorna à traseira automática com aviso e limpeza do registro;
permissão negada não dispara nova tentativa. Armazenamento indisponível não bloqueia
a leitura. Limpar dados do site ou trocar navegador elimina a preferência.

## Versão 10 — piloto de retirada por referência visual

Sem carrinho ou consulta de produto. Apoiar o celular, abrir a câmera escolhida,
retirar todas as etiquetas e tocar Preparar área vazia antes da primeira leitura.
Usar fundo iluminado, nítido e com detalhes. Referência com barras decodificáveis,
escura ou sem textura é recusada. Uma etiqueta indecodificável pode escapar da
checagem: cabe ao operador garantir área vazia na preparação.

Após leitura, retirar completamente o produto até a referência reaparecer.
Quatro quadros com tempos de vídeo distintos devem corresponder ao fundo: erro
médio absoluto <=2/255, máximo em blocos 8x8 <=6/255, textura horizontal >=85%
da referência e luminosidade entre 30 e 235. Amostra 96x160 em luminância, quadro
inteiro. Tempos repetidos de vídeo não contam. Falhas de decode nunca bastam
para liberar; referência ausente ou observação incerta mantém bloqueio.

Limiares experimentais, sem comprovação em vídeo real. Comparação com referência
não é rastreamento universal de etiquetas; fundos repetidos, produtos muito pequenos
e preparação incorreta podem comprometer evidência. Não integrar ao carrinho
antes do piloto. Movimento, iluminação ou foco alterados podem impedir liberação.
Nesses casos reiniciar sessão e preparar novamente; não há liberação por botão.

Preserva bloqueio por código, permite B enquanto A bloqueado e libera todos apenas
quando a cena inteira retorna à referência. No modo preparado usa ZXing, invalidando
respostas nativas anteriores; encerrar/trocar câmera apaga referência e observações.
Capturas JSON incluem preparação, quadros coincidentes, erro e códigos bloqueados.

Roteiro de piloto: manter A parado durante 10s, desfocar/escurecer sem retirar,
apresentar A e B, retirar completamente e reapresentar A cinco vezes. Verificar
contagem e sinal sonoro: uma leitura por apresentação e nenhuma durante permanência.
Salvar capturas e JSON se houver repetição indevida ou retirada sem liberação.

## Versão 11 — exposição e diagnóstico da retirada

Operador relatou preparação e primeira leitura bem-sucedidas, mas sem retorno
à área vazia. Sem amostra da falha: causa física ainda não confirmada.
Comparação passa a compensar somente deslocamento global de brilho de até 20/255
antes dos mesmos limites de erro médio/bloco; mantém bloqueio por perda de textura,
quadros congelados, mudança local da cena e luminosidade extrema.
Tela informa o motivo observado; JSON inclui amostras de luminância 96x160 da
referência e do último quadro comparado, métricas e razão. Capturar com produto
retirado se persistir bloqueio. Amostras são imagens reduzidas da cena, somente
no arquivo baixado, sem envio ao servidor. Não é prova de viabilidade da abordagem.

## Versão 12 — repetição explícita, decisão de 09/11/2026

Operador aprovou substituir retirada automática por Ler novamente. Não há
calibração ou comparação de fundo. Cada código é lido uma vez por ciclo, códigos
diferentes seguem automaticamente. Ler novamente limpa o conjunto de bloqueios
e invalida respostas nativas pendentes, sem gerar leitura sozinho. O código sob
a câmera poderá ser lido novamente mesmo sem retirar a etiqueta, após gesto
explícito. Fechamento e troca de câmera mantêm cancelamento por sessão.
Histórico de testes da estratégia de área vazia foi substituído por regressões
da regra aprovada; não alegar que retirada automática foi validada.

## Integração na venda — 09/11/2026

PDV mobile possui ícone de câmera. Abre diálogo nativo com prévia, seletor,
Ler novamente, Fechar e confirmação de adição. Captura usa ZXing local, formatos
EAN-13/Code 128, preferência do navegador e bloqueio por código com liberação
explícita. Não há área vazia. Fila da venda consulta Product.code exato e confirma
nome/quantidade e som somente após adição. Consultas de sessão encerrada ou câmera
trocada são ignoradas. Busca e leitor físico permanecem disponíveis após fechar.
Desktop não mostra acionamento. Produtos/consulta fora da venda ainda pendentes.
Teste físico pendente: câmera lembrada, troca, etiquetas diferentes, repetição,
desconhecido, permissão, fechar durante consulta, som e layout no celular.

## Ajuste do pop-up de venda — 09/11/2026

Seletor no topo à esquerda e botão vermelho 44x44 com × à direita, nome acessível
Fechar câmera. Ler novamente imediatamente abaixo da prévia, largura completa.
Diálogo em coluna com altura limitada pela viewport dinâmica; a prévia ocupa o
espaço restante, sem empurrar os controles para fora da tela. Mensagem longa tem
rolagem interna limitada; em telas baixas omitir apenas ajuda complementar.
Fluxo de captura e carrinho inalterado. Validar conforto no celular.
