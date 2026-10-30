# Comparação de captura com Quagga2

Página separada: /camera-quagga.html. Usa Quagga.init com LiveStream, Quagga.start
e Quagga.stop, sem compartilhar captura ou leitores com o protótipo ZXing.
Pacote @ericblade/quagga2 1.13.0 oficial npm, bundle minificado copiado de dist,
apenas com cabeçalho local de proveniência. SHA-256 do pacote: bcd9f3f4df8d735fec260a0d7c7a1bb5a04ee7ec568fa240bc9b045988542da7.
Licenças MIT do projeto e componentes incluídos em quagga-decoder.LICENSE.txt,
servidas localmente e copiadas com modo 644 na imagem. Sem CDN e sem envio de
frames. Nenhum cadastro consultado nem carrinho alterado.

Configuração: leitores ean_reader/code_128_reader; locate=true; halfSample=false;
patchSize=medium; frequência máxima 10/s; captura traseira preferida 1920×1080.
Apenas opções preferenciais de resolução; sem ajuste de foco customizado.
Dupla confirmação em quadros consecutivos; bloqueio por código até liberação
manual. Retirada automática continua fora deste experimento. Prévia e contagem
de quadros, candidato reconhecido e região localizada auxiliam o diagnóstico.
Câmeras enumeradas após permissão. Reabertura impedida durante inicialização ou
encerramento; resposta tardia e callbacks antigos não podem produzir resultados.

Ensaio offline: leitor EANReader do bundle sobre linhas binarizadas da foto do
operador retornou 7896004762098 / ean_13. Esse teste não comprova localização
automática da etiqueta inteira nem funcionamento da captura real no celular.
Foto não foi incorporada ao repositório. Teste de símbolo EAN-13 sintético usa
o bundle real; demais testes de ciclo de captura usam Quagga simulado.

Para comparar: abrir no mesmo S24/Chrome, mesma etiqueta e iluminação. Tocar em
Abrir câmera e observar contador; candidato requer duas leituras seguidas para
confirmar. Testar outra câmera se necessário. Fechar, trocar de aplicativo e
reabrir. Sem alegação de compatibilidade validada até ensaio no aparelho.

Verificação: npm test; npm run check; pipeline de homologação e HTTP público.
Referência primária: https://github.com/ericblade/quagga2.
