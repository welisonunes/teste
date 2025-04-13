// index.js
require('dotenv').config();
const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Configurações do Puppeteer para Docker
process.env.PUPPETEER_EXECUTABLE_PATH = '/usr/bin/chromium-browser';
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';

const app = express();
const port = process.env.PORT || 3000;

// Configuração do Puppeteer
puppeteer.use(StealthPlugin());
app.use(express.json());

async function fetchWithPuppeteer(targetUrl) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
  });

  const page = await browser.newPage();
  
  try {
    // Primeiro acesso para estabelecer sessão
    await page.goto('https://demo.wee.bet/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Interceptação de requests
    await page.setRequestInterception(true);
    
    page.on('request', (request) => {
      const headers = {
        ...request.headers(),
        'authority': 'center.weebet.tech',
        'referer': 'https://demo.wee.bet/',
        'sec-fetch-site': 'same-site'
      };
      request.continue({ headers });
    });

    // Requisição para a API
    const response = await page.goto(targetUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    const data = await response.json();
    await browser.close();
    return data;
    
  } catch (error) {
    await browser.close();
    throw error;
  }
}

// Endpoint POST
app.post('/fetch-data', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    const result = await fetchWithPuppeteer(url);
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch data',
      details: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});