const express = require('express');
const PdfPrinter = require('pdfmake');
const puppeteer = require('puppeteer');
const path = require('path');
const { styleText } = require('util');

const app = express();
const PORT = 8080;
const TIMEOUT = 60000 * 2; // 2 minutos

app.use(express.json());

// Middleware para definir timeout nativo
app.use((req, res, next) => {
  // Define o timeout para 5 segundos (5000 ms)
  req.setTimeout(TIMEOUT, () => {
    // Responde com um erro de timeout quando o limite é excedido
    res.status(503).send('Tempo de requisição excedido');
  });
  next();
});

// Função para gerar o gráfico em Base64 usando Puppeteer com Highcharts
const generateChartBase64 = async (
  series,
  presetMin,
  presetMax,
  title,
  subTitle,
  textLegend,
  maxValueHistory,
  minValueHistory,
  valueSuffix = '°C',
  marcadorx,
  marcadory,
  marcadorLabel
) => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  //Usar esse em produção
  // para testar no linux which chromium-browser
  // const browser = await puppeteer.launch({
  //   args: ['--no-sandbox', '--disable-setuid-sandbox'],
  //   headless: true,
  //   executablePath: '/usr/bin/chromium-browser'
  // });
  const page = await browser.newPage();

  //const maximoHistorico = Math.max(...series.map((item) => item[1]));
  //const minimoHistorico = Math.min(...series.map((item) => item[1]));

  const max = Math.round(maxValueHistory);
  const min = Math.round(minValueHistory);

  console.log('max', max);
  console.log('min', min);

  if (marcadorx !== null && marcadorx !== undefined || marcadory !== null && marcadory !== undefined) {
    const ponint = {
      x: marcadorx,
      y: marcadory,
      marker: {
        enabled: true,
        fillColor: "#2caffe",
        lineColor: "white",
        lineWidth: 0.5,
        radius: 4,
        symbol: "circle",
      },
      dataLabels: {
        enabled: true,
        format: `{y}${marcadorLabel}`,
        style: {
          color: "black",
          fontWeight: "bold",
        },
      },
    };

    series.push(ponint);
  }



  // Conteúdo HTML do gráfico com Highcharts e a marca d'água
  const chartHTML = `
  <!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Highcharts</title>
    <script src="https://code.highcharts.com/highcharts.js" defer></script>
  </head>
  <body>
    <div id="container" class="container" style="width: 800; height:800"></div>

    <script>
      document.addEventListener("DOMContentLoaded", function () {
        Highcharts.chart("container", {
        
          credits: {
            enabled: true,
            text: "appsupply",
            href: "https://painel.appsupply.ml/",
        },
          title: {
            text: ${JSON.stringify(title)},
             style: {
              fontWeight: "normal",
            },
          },
          subtitle: {
            text: ${JSON.stringify(subTitle)},
             style: {
              fontWeight: "normal",
            },
          },
          xAxis: {
            type: "datetime",
            labels: {
              format: '{value:%H:%M}'
            }
          },
          yAxis: {
            title: {
              text: ${JSON.stringify(textLegend)},
            },
          },
          series: [
            {
              name: ${JSON.stringify(textLegend)},
              type: "line",
              data: ${JSON.stringify(series)},
              marker: {
                enabled: false,
              },
              
              tooltip: {
                valueDecimals: 1,
                valueSuffix: ${JSON.stringify(valueSuffix)},
              },
            },
          ],
            yAxis: {
            tickInterval: ${max} >= ${60} ? ${10} : ${5},
            title: {
              text: ${JSON.stringify(textLegend)},
              align: "middle",
             
            },
            opposite: false,
            max: ${max},
            min: ${min},

            plotLines: [
              {
                value: ${presetMax},
                color: "red",
                dashStyle: "ShortDash",
                width: 2,
                label: {
                  text: "máx ${presetMax}",
                },
              },
              {
                value: ${presetMin},
                color: "yellow",
                dashStyle: "ShortDash",
                width: 2,
                label: {
                  text: "min ${presetMin}",
                },
              },
            ],
          },
          plotOptions: {
            series: {
              animation: false, // Desabilita a animação das linhas
            },
          },
        });
      });
    </script>
  </body>
</html>


  `;



  // Renderiza o HTML no Puppeteer
  await page.setContent(chartHTML);

  await page.setViewport({ width: 800, height: 800, deviceScaleFactor: 2 });

  // Aguardar que o Highcharts carregue completamente os dados
  await page.waitForFunction(() => document.querySelector('#container') !== null, { timeout: 60000 });

  const element = await page.$('#container');
  const imageBuffer = await element.screenshot({ encoding: 'base64' });
  await browser.close();

  return imageBuffer;
};



// Endpoint para obter o gráfico em Base64
app.post('/chart', async (req, res) => {
  try {
    const {
      minimoHistorico,
      maximoHistorico,
      presetMin,
      presetMax,
      series,
      title,
      subTitle,
      textLegend,
      valueSuffix,
      marcadorx,
      marcadory,
      marcadorLabel
    } = req.body;

    if (
      minimoHistorico === null || minimoHistorico === undefined || maximoHistorico === null || maximoHistorico === undefined ||
      presetMin === null || presetMin === undefined || presetMax === null || presetMax === undefined ||
      series.length <= 0 || title.length <= 0 || subTitle.length <= 0 || textLegend.length <= 0
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Dados incompletos!' }),
      };
    }




    let maxValueHistory = 0;
    let minValueHistory = 0;

    if (maximoHistorico > presetMax) {
      maxValueHistory = (maximoHistorico * 1.2);
    } else {
      maxValueHistory = (presetMax * 1.2);
    }


    if (minimoHistorico < presetMin) {
      minValueHistory = (minimoHistorico * 0.8);
    } else {
      minValueHistory = (presetMin * 0.8);
    }


    const base64Image = await generateChartBase64(
      series,
      presetMin,
      presetMax,
      title,
      subTitle,
      textLegend,
      maxValueHistory,
      minValueHistory,
      valueSuffix,
      marcadorx,
      marcadory,
      marcadorLabel

    );
    res.json({ base64: base64Image });
  } catch (error) {
    console.error('Erro ao gerar o gráfico:', error);
    res.status(500).json({ error: 'Erro ao gerar o gráfico' });
  }
});
app.post('/pdf', async (req, res) => {
  function paginateTableRows(rows, maxRowsPerPage) {
    const paginatedRows = [];
    for (let i = 0; i < rows.length; i += maxRowsPerPage) {
      paginatedRows.push(rows.slice(i, i + maxRowsPerPage));
    }
    return paginatedRows;
  };

  const images = `data:image/png;base64,${req.body.images[0]}`;
  console.log(images);


  //função para o header
  const header = (currentPage, pageCount) => {
    return {
      table: {
        widths: ['auto', '*', 'auto'],
        body: [
          [
            '',
            '',
            {
              text: new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR'),
              alignment: 'right',
              style: {
                fontSize: 9,
                color: '#386481',
              },
            },
          ],
        ],
      },
      layout: 'noBorders',
      margin: [10, 10, 10, 0],
    };
  };
  // Função para rodapé
  const footer = (currentPage, pageCount) => {
    return {

      table: {
        widths: ['auto', '*', '*', 'auto'],
        body: [
          [
            // QR Code como imagem
            {
              image: path.join(__dirname, '../assets', 'qrcode.png'), // Substitua pelo caminho do QR code
              width: 50,
              alignment: 'center',

            },
            // Texto descritivo
            {
              text: `Todo seu conteúdo informativo com gráficos, históricos e relatórios direto no seu smartphone. Acesse o SisWeb Mobile a partir do código QR ao lado e tenha em mãos um sistema completo em qualquer lugar`,
              fontSize: 9,
              color: '#386481',
              alignment: 'left',


            },
            {
              text: `\n\nwww.supplymonitoring.com.br\ncontato@supplymonitoring.com.br`,
              fontSize: 9,
              color: '#386481',
              alignment: 'left',
              margin: [0, -10, 0, 0]

            },
            // Logotipo como imagem
            {
              image: path.join(__dirname, '../assets', 'supply.png'), // Substitua pelo caminho do QR code
              width: 50,
              alignment: 'center',


            },
          ],
          // Linha separadora e número da página
          [
            {
              text: '',
              colSpan: 3,
              border: [true, true, true, false],

            },
            '',
            '',
            '',
          ],
          [
            '',
            '',

            {
              text: `Página ${currentPage} de ${pageCount}`,
              alignment: 'right',
              fontSize: 8,
              margin: [0, 0, -50, 0]
            },
            '',
          ],
        ],
      },
      layout: 'noBorders',
      margin: [20, -50, 10, 0], // Margens do rodapé
    };
  };
  const fonts = {
    Roboto: {
      normal: path.join(__dirname, 'fonts/Roboto', 'Roboto-Regular.ttf'),
      bold: path.join(__dirname, 'fonts/Roboto', 'Roboto-Bold.ttf'),
      italics: path.join(__dirname, 'fonts/Roboto', 'Roboto-Italic.ttf'),
      bolditalics: path.join(__dirname, 'fonts/Roboto', 'Roboto-BoldItalic.ttf'),
    },
  };


  // Inicializando o PdfPrinter com as fontes
  const printer = new PdfPrinter(fonts);

  //criei um array de dados com 3 colunas e 200 linhas
  const dataTable = [
    [
      "30/10/2024 - 16:02:13",
      "SMCCA ESPREE VCA - COMPRESSOR desligado por falha no fornecimento de energia no circuito do equipamento em 30/10/24 às 15:59:34",
      ">Sr. Iverson informa oscilação de energia da rede de distribuição - justificado por Suporte em 31/10/2024 14:25:28",
    ], [
      "30/10/2024 - 16:07:13",
      "SMCCA ESPREE VCA - COMPRESSOR retornou ao pleno funcionamento em 30/10/24 às 16:00:51",
      "Retorno de funcionamento do compressor após falha ou parada prévia.",
    ], [
      "30/10/2024 - 16:07:18",
      "SMCCA ESPREE VCA - COMPRESSOR desligado por falha no fornecimento de energia no circuito do equipamento em 30/10/24 às 16:02:18",
      ">Sr. Iverson informa oscilação de energia da rede de distribuição - justificado por Suporte em 31/10/2024 14:25:40",
    ], [
      "15/11/2024 - 02:18:45",
      "SMCCA ESPREE VCA - COMPRESSOR desligado por falha no fornecimento de energia no circuito do equipamento em 15/11/24 às 02:13:47",
      "Retorno de funcionamento do compressor após falha ou parada prévia.",
    ], [
      "15/11/2024 - 02:18:55",
      "SMCCA ESPREE VCA - COMPRESSOR retornou ao pleno funcionamento em 15/11/24 às 02:14:51",
      "Retorno de funcionamento do compressor após falha ou parada prévia.",
    ], [
      "15/11/2024 - 02:38:38",
      "SMCCA ESPREE VCA - COMPRESSOR retornou ao pleno funcionamento em 15/11/24 às 02:36:09",
      "Retorno de funcionamento do compressor após falha ou parada prévia.",
    ], [
      "23/11/2024 - 23:42:09",
      "SMCCA ESPREE VCA - COMPRESSOR desligado por falha no fornecimento de energia no circuito do equipamento em 23/11/24 às 23:40:15",
      "Retorno de funcionamento do compressor após falha ou parada prévia.",
    ], [
      "23/11/2024 - 23:42:22",
      "SMCCA ESPREE VCA - COMPRESSOR retornou ao pleno funcionamento em 23/11/24 às 23:41:15",
      "Retorno de funcionamento do compressor após falha ou parada prévia.",
    ], [
      "23/11/2024 - 23:47:10",
      "SMCCA ESPREE VCA - COMPRESSOR desligado por falha no fornecimento de energia no circuito do equipamento em 23/11/24 às 23:42:36",
      "Retorno de funcionamento do compressor após falha ou parada prévia.",
    ], [
      "23/11/2024 - 23:52:09",
      "SMCCA ESPREE VCA - COMPRESSOR retornou ao pleno funcionamento em 23/11/24 às 23:51:09",
      "Retorno de funcionamento do compressor após falha ou parada prévia.",
    ], [
      "23/11/2024 - 23:57:16",
      "SMCCA ESPREE VCA - COMPRESSOR desligado por falha no fornecimento de energia no circuito do equipamento em 23/11/24 às 23:52:31",
      "Retorno de funcionamento do compressor após falha ou parada prévia.",
    ], [
      "24/11/2024 - 00:07:12",
      "SMCCA ESPREE VCA - COMPRESSOR retornou ao pleno funcionamento em 24/11/24 às 00:03:18",
      "Retorno de funcionamento do compressor após falha ou parada prévia.",
    ], [
      "24/11/2024 - 00:07:18",
      "SMCCA ESPREE VCA - COMPRESSOR desligado por falha no fornecimento de energia no circuito do equipamento em 24/11/24 às 00:04:36",
      "Retorno de funcionamento do compressor após falha ou parada prévia.",
    ], [
      "24/11/2024 - 00:27:17",
      "SMCCA ESPREE VCA - COMPRESSOR retornou ao pleno funcionamento em 24/11/24 às 00:24:35",
      "Retorno de funcionamento do compressor após falha ou parada prévia.",
    ], [
      "24/11/2024 - 02:02:10",
      "SMCCA ESPREE VCA - COMPRESSOR desligado por falha no fornecimento de energia no circuito do equipamento em 24/11/24 às 02:00:33",
      "Retorno de funcionamento do compressor após falha ou parada prévia.",
    ], [
      "24/11/2024 - 02:07:09",
      "SMCCA ESPREE VCA - COMPRESSOR retornou ao pleno funcionamento em 24/11/24 às 02:02:15",
      "Retorno de funcionamento do compressor após falha ou parada prévia.",
    ], [
      "24/11/2024 - 02:07:14",
      "SMCCA ESPREE VCA - COMPRESSOR desligado por falha no fornecimento de energia no circuito do equipamento em 24/11/24 às 02:03:25",
      "Retorno de funcionamento do compressor após falha ou parada prévia.",
    ], [
      "24/11/2024 - 02:27:23",
      "SMCCA ESPREE VCA - COMPRESSOR retornou ao pleno funcionamento em 24/11/24 às 02:23:24",
      "Retorno de funcionamento do compressor após falha ou parada prévia.",
    ], [
      "25/11/2024 - 03:19:49",
      "SMCCA ESPREE VCA - COMPRESSOR desligado por falha no fornecimento de energia no circuito do equipamento em 25/11/24 às 03:13:22",
      "Retorno de funcionamento do compressor após falha ou parada prévia.",
    ],

  ];

  // Populate 200 rows dynamically
  for (let i = 1; i <= 200; i++) {
    dataTable.push([
      "30/10/2024 - 16:02:13",
      "SMCCA ESPREE VCA - COMPRESSOR desligado por falha no fornecimento de energia no circuito do equipamento em 30/10/24 às 15:59:34",
      ">Sr. Iverson informa oscilação de energia da rede de distribuição - justificado por Suporte em 31/10/2024 14:25:28",
    ],);
  }

  const paginatedRows = paginateTableRows(dataTable, 20);

  // Gerar conteúdo da tabela com várias páginas
  const content = paginatedRows.flatMap((pageRows, index) => [
    {
      table: {
        headerRows: 1,
        widths: [70, 'auto', '*'],
        body: [[{ text: 'Data/Hora', fontSize: 8 }, { text: 'Mensagem', fontSize: 8 }, { text: 'Observação', fontSize: 8 }], ...pageRows], // Cabeçalho + linhas da página
      },
      layout: 'headerLineOnly', // Estilo da tabela
      style: {
        fontSize: 7,
        alignment: 'center'
      },

    },
    index < paginatedRows.length - 1 ? { text: '', pageBreak: 'after' } : null, // Adiciona quebra de página

  ]);

  const docDefinition = {
    header: header,
    content: [

      {
        text: 'S.I.M.E.A',
        style: {
          fontSize: 10,
          bold: true,
          color: 'gray',
          alignment: 'center',
          margin: [0, 0, 0, 10],
        },
      },
      {
        text: 'SISTEMA INTELIGENTE DE MONITORAMENTO DE ENERGIA E AMBIÊNCIA',
        style: {
          fontSize: 8,
          bold: true,
          color: 'gray',
          alignment: 'center',
          margin: [0, 0, 0, 10],
        },
      },
      {
        text: 'RELATÓRIO DE ACOMPANHAMENTO',
        style: {
          fontSize: 8,
          bold: true,
          color: 'gray',
          alignment: 'center',
          margin: [0, 0, 0, 10],
        },
      },
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: 515,
            y2: 0,
            lineWidth: 1,
            lineColor: '#D73F33',
          },
        ],
        margin: [0, 10, 0, 10],
      },

      {
        table: {
          headerRows: 1,
          widths: ['*', '*', '*', '*'],
          body: [
            [
              [
                { text: 'Cliente:', bold: true, alignment: 'left' },
                { text: 'Equipamento:', bold: true, alignment: 'left' },
                { text: 'Endereço:', bold: true, alignment: 'left' },

              ],
              [
                { text: 'Multimagem', alignment: 'left' },
                { text: 'DC MULTI PIT SSA', alignment: 'left' },
                {
                  text: 'Avenida Manoel Dias Da Silva, 675,- Pituba - Salvador-BA',
                  alignment: 'left',
                },
              ],
              [
                { text: 'CNPJ:', bold: true, alignment: 'left' },
                { text: 'Responsável:', bold: true, alignment: 'left' },
                { text: 'Período:', bold: true, alignment: 'left' },



              ],

              [

                { text: '01.126.692/0001-81', alignment: 'left' },
                { text: 'Ingreddy Brandão', alignment: 'left' },
                { text: '01/12/2024 a 17/12/2024', alignment: 'left' },


              ],

            ]
          ],
        },
        layout: 'noBorders',
        style: {
          fontSize: 8,
        },
        margin: [0, 0, 0, 10],
      }, content.filter(Boolean), {
        text: '',
        pageBreak: 'before', // Quebra de página antes da imagem
      }, {
        pageOrientation: 'landscape', // Orientação paisagem
        stack: [
          {
            image: images,
            width: 500, // Ajuste a largura da imagem para paisagem
            alignment: 'center', // Centralize a imagem
            
            justifyContent: 'center',
            margin: [0, 0, 0, 0], // Espaçamento superior
          },
        ],

      }],
    footer: footer,
    defaultStyle: {
      font: 'Roboto',
    },
  };




  // Criando o PDF no formato stream
  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename=document.pdf');

  // Enviando o PDF como resposta
  pdfDoc.pipe(res);
  pdfDoc.end();
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

