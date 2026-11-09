# Estúdio de ferramentas

O Estúdio fica em segundo plano no início, com atalhos diretos para as três áreas. Ele também abre pela lateral e pelos endereços `#/estudio/medidas`, `#/estudio/dados` e `#/estudio/texto`. Tudo roda no navegador e nada é enviado ao servidor.

| Área | Funções |
| --- | --- |
| Medidas | Categoria, unidade de origem e de destino, botão para inverter, resultado ao digitar e botão para copiar o valor com a unidade. |
| Dados | Importação de CSV (arquivo, arrastar e soltar ou colar), separador detectado automaticamente (vírgula, ponto e vírgula, tabulação ou barra vertical), amostra de 100 linhas, ordenação por coluna e seleção das linhas que vão para o chat como tabela Markdown. |
| Texto e código | Contagem de palavras, caracteres, caracteres sem espaços e linhas. JSON formatado ou compactado, com linha, coluna e marcador do primeiro erro de sintaxe. Outras operações: remover linhas repetidas ou em branco, ordenar linhas, criar slug, numerar linhas, codificar e decodificar URL e contar bytes UTF-8. |

“Usar na conversa” abre uma prévia editável. Nela você escolhe a conversa de destino (a aberta, uma nova ou outra do histórico). O conteúdo entra no fim do rascunho daquela conversa, sem apagar o que já estava digitado. A mensagem só é enviada quando você pressiona Enviar.

## Contagem verificável

O catálogo de `public/studio/catalog.js` continua com 1.110 operações: 1.098 conversões direcionais entre unidades de dez categorias (comprimento, massa, tempo, área, volume, armazenamento, velocidade, frequência, energia e pressão) e 12 utilitários de texto e código. O cálculo usa ponto flutuante com até 12 algarismos significativos. Os testes em `tests/studio.mjs` percorrem todas as conversões e fazem a ida e a volta de cada uma. Eles também conferem o leitor de CSV, a ordenação, a saída em Markdown, as contagens e a localização dos erros de JSON.
