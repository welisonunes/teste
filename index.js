const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const app = express();
const port =  3000;

// Configurações otimizadas para Puppeteer
process.env.PUPPETEER_EXECUTABLE_PATH = '/usr/bin/chromium-browser';
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';

// Cache para reutilização do browser
let browserInstance = null;
const MAX_CONCURRENT_REQUESTS = 1; // Reduzido para 1 em ambientes limitados
let activeRequests = 0;

// Configuração do Puppeteer
puppeteer.use(StealthPlugin());
app.use(express.json());

async function getBrowser() {
  if (!browserInstance || !await isBrowserConnected(browserInstance)) {
    browserInstance = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
        '--no-zygote',
        '--disable-gpu',
        '--font-render-hinting=none',
        '--disable-features=IsolateOrigins,site-per-process'
      ],
      timeout: 60000,
      protocolTimeout: 120000 // Aumentado para 2 minutos
    });
  }
  return browserInstance;
}

async function isBrowserConnected(browser) {
  try {
    const version = await browser.version();
    return !!version;
  } catch (error) {
    return false;
  }
}

async function fetchWithPuppeteer(targetUrl) {
  while (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  activeRequests++;
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Configuração de timeout e recursos bloqueados
    await page.setRequestInterception(true);
    page.on('request', (req) => {
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

    // Acesso otimizado com verificação
    await page.goto('https://demo.wee.bet/', {
      waitUntil: 'domcontentloaded',
      timeout: 40000
    });

    // Request principal com tratamento de status
    const response = await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    if (!response.ok()) {
      throw new Error(`HTTP Error ${response.status()}`);
    }

    return await response.json();

  } catch (error) {
    console.error('Erro durante o scraping:', error);
    throw error;
  } finally {
    await page.close().catch(error => console.error('Erro ao fechar página:', error));
    activeRequests--;
  }
}

// Endpoint POST com tratamento melhorado
app.post('/fetch-data', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url?.includes('weebet.tech')) {
      return res.status(400).json({ error: 'URL inválida ou não fornecida' });
    }

    const result = await Promise.race([
      fetchWithPuppeteer(url),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout após 120s')), 120000)
      )
    ]);

    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      error: 'Falha na requisição',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Gerenciamento de shutdown
process.on('SIGTERM', async () => {
  console.log('Recebido SIGTERM, encerrando...');
  if (browserInstance) {
    await browserInstance.close().catch(error => console.error('Erro ao fechar browser:', error));
  }
  process.exit(0);
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});