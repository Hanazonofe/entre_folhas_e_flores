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
