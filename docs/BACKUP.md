# Backup e restauração

O processo backup é separado do servidor HTTP. Gera `pg_dump --format=custom --no-owner --no-acl`, manifesto (versão do aplicativo/esquema, data e SHA-256 do dump) e tar criptografado por age. SHA-256 do arquivo criptografado fica em backup_runs. Arquivos temporários claros não entram no volume de backups; não habilitar swap sem criptografia se a memória temporária contiver dados sensíveis.

## Chaves e Google Drive

Em computador administrativo, fora do servidor operacional, instale age de fonte oficial e execute:

```sh
age-keygen -o pdv-recovery.key
age-keygen -y pdv-recovery.key
```

Guarde a chave privada em dois locais seguros separados e teste a leitura. Copie **só a chave pública age1...** para `secrets/age_recipient`. A chave privada não fica no servidor. Perda da chave impossibilita recuperação dos arquivos criptografados.

No Google Cloud, habilite Drive API e crie cliente OAuth do tipo aplicativo desktop. Configure tela de consentimento/usuários autorizados e modo adequado para credencial durável (modo de teste pode expirar autorizações). Não usar login Google para operadores. Em computador administrativo com navegador/internet e dependências do backend instaladas:

```sh
python scripts/authorize_drive.py --client /caminho/client-secret.json --output /pasta-nova/pdv-drive
```

O utilitário solicita apenas `drive.file`, cria pasta exclusiva e grava `drive.json` com refresh token e `drive_folder_id`, modo 0600. Transferir via canal protegido `drive.json` para `secrets/drive/drive.json` e o conteúdo do identificador para `secrets/drive_folder_id`. Não enviar arquivos de credenciais ao GitHub. Reiniciar `docker compose restart backup` após autorização/rotação. Sem credenciais, a falha é mostrada ao administrador, mas vendas continuam.

## Agendamento e retenção

A cada 30 segundos verifica o último horário civil das 23h de São Paulo. Data única e advisory lock impedem duplicação entre processos. Ao reiniciar depois de perda do horário, gera uma cópia referente ao horário mais recente perdido; não inventa snapshots de dias anteriores. Reenvios ocorrem a cada 15 minutos. Cada arquivo tem ID de Drive persistido antes do upload, sessão retomável e verificação de tamanho/MD5 remoto; resposta perdida é reconciliada pelo ID e checksum.

Manter 30 envios confirmados no Drive. Excluir cópias locais já enviadas somente depois de sete dias do envio. Pendentes nunca são removidos automaticamente. Exclusão remota verifica pasta exclusiva e identificação do backup. A interface mostra geração, envio, erros, pendências e alerta com mais de 26h sem confirmação. Monitorar também disco e memória no Linux: fila não protege contra falha física do servidor.

## Restauração isolada

1. Escolher arquivo confirmado, baixar pela conta administrativa e comparar SHA-256 com o registro de backup quando disponível. Copiar ciphertext e chave privada para estação de recuperação protegida.
2. Criar **outra instância PostgreSQL isolada**, sem clientes/worker, e banco vazio. Usar a imagem de backup deste commit (pg_restore da mesma versão principal do pg_dump). Guardar URL do proprietário do destino num arquivo 0600.
3. Executar no ambiente com Python/dependências, age e pg_restore:

```sh
python -m pdv.restore --archive /recuperacao/backup.tar.age \
  --identity /recuperacao/pdv-recovery.key \
  --target-url-file /recuperacao/destino-url \
  --confirm-empty-target
```

O utilitário recusa banco com tabelas públicas, valida formato/nomes dos membros/checksum, restaura em transação única e verifica revisão. Sessões são revogadas; registros da fila antiga ficam archived sem caminhos locais/retomadas para não reenviar arquivos da máquina antiga. Não executa a troca de base operacional.

4. Reaplicar migrações e `deployment/grants.sql` com proprietário, criando papéis locais seguros se necessário. Conferir contagens, totais ativos, distribuição financeira, histórico/autores, produto cadastral e login. Não ligar worker antes de configurar nova pasta/chaves e conferir retenção. Verificar comprovante ativo/cancelado.
5. Somente em janela autorizada: impedir novas vendas, resolver pendências, guardar backup final da base substituída e apontar a instalação para o banco validado. Manter base anterior isolada para recuperação. Não sobrescrever o único exemplar existente. Remover chave privada da máquina operacional se tiver sido levada temporariamente para recuperação.

Este procedimento não oferece recuperação por venda nem restauração em ponto arbitrário. RPO nominal diário, maior durante falta de internet; RTO depende do equipamento e deve ser medido no piloto. Testar gerar, enviar, baixar e restaurar antes da entrada em operação e periodicamente depois.
