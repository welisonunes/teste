const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const Xvfb = require('xvfb');
const app = express();

// Configuração do Xvfb para virtual display
const xvfb = new Xvfb({
  silent: true,
  xvfb_args: ['-screen', '0', '1280x720x16', '-ac']
});

// Inicializa o virtual display
try {
  xvfb.startSync();
  console.log('Xvfb inicializado com sucesso');
} catch (error) {
  console.error('Falha ao iniciar Xvfb:', error);
}

// Configurações do Puppeteer
const port =  process.env.PORT || 10000 ;
process.env.PUPPETEER_EXECUTABLE_PATH = '/usr/bin/chromium-browser';
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';

// Variáveis de controle
let browserInstance = null;
const MAX_CONCURRENT_REQUESTS = 1;
let activeRequests = 0;

// Configuração do Express
puppeteer.use(StealthPlugin());
app.use(express.json());

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    memory: process.memoryUsage(),
    activeRequests,
    uptime: process.uptime()
  });
});

// Gerenciamento do Browser
async function getBrowser() {
  if (!browserInstance || !(await isBrowserConnected())) {
    console.log('Iniciando novo navegador...');
    browserInstance = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
        '--no-zygote',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--font-render-hinting=none',
        '--disable-features=IsolateOrigins,site-per-process,AudioServiceOutOfProcess'
      ],
      timeout: 90000,
      protocolTimeout: 180000
    });
  }
  return browserInstance;
}

async function isBrowserConnected() {
  try {
    return !!browserInstance && (await browserInstance.version());
  } catch (error) {
    console.log('Browser desconectado:', error.message);
    return false;
  }
}

// Função principal de scraping
async function fetchWithPuppeteer(targetUrl) {
  let browser, page;
  
  try {
    // Controle de concorrência
    while (activeRequests >= MAX_CONCURRENT_REQUESTS) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    activeRequests++;

    // Configuração do navegador
    browser = await getBrowser();
    page = await browser.newPage();

    // Otimizações de performance
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (['image', 'font', 'stylesheet', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue({
          headers: {
            ...req.headers(),
            'authority': 'center.weebet.tech',
            'referer': 'https://demo.wee.bet/',
            'sec-fetch-site': 'same-site',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
          }
        });
      }
    });
    await page.setDefaultNavigationTimeout(240000);
    // Navegação inicial
    await page.goto('https://demo.wee.bet/', {
      waitUntil: 'networkidle0',
      timeout: 240000
    });

    // Requisição principal
    const response = await page.goto(targetUrl, {
      waitUntil: 'networkidle0',
      timeout: 240000
    });

    if (!response.ok()) {
      throw new Error(`Erro HTTP ${response.status()}`);
    }

    return await response.json();

  } catch (error) {
    console.error('Erro durante a operação:', error);
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    activeRequests--;
  }
}

// Endpoint de requisições
app.post('/fetch-data', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url?.includes('weebet.tech')) {
      return res.status(400).json({ error: 'URL inválida' });
    }

    const result = await Promise.race([
      fetchWithPuppeteer(url),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout após 180s')), 180000)
      ) 
    ]);

    res.json(result);

  } catch (error) {
    res.status(500).json({
      error: 'Falha na requisição',
      details: error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
});

// Gerenciamento de shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
  console.log('Encerrando aplicação...');
  try {
    if (browserInstance) await browserInstance.close();
    xvfb.stopSync();
  } catch (error) {
    console.error('Erro no encerramento:', error);
  }
  process.exit(0);
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${port}`);
});