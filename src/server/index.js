const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 8080;
const TIMEOUT = 60000;

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
    <title>Highcharts Example</title>
    <script src="https://code.highcharts.com/highcharts.js"></script>
  </head>
  <body>
    <div id="container" style="width: 800; height: 800"></div>

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

  // Aguardar que o Highcharts carregue completamente os dados
  await page.waitForSelector('#container', { visible: true });
  await page.setViewport({ width: 800, height: 800, deviceScaleFactor: 2 });
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

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

