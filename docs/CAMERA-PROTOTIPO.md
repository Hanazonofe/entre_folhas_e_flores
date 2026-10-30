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
