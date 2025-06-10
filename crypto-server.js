#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';

const server = new Server({ name: 'crypto-server', version: '1.0.0' }, { capabilities: { tools: {} }});
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// Recherche dynamique de crypto
async function getCryptoPrice(cryptoName) {
  try {
    const searchUrl = `${COINGECKO_API}/search?query=${encodeURIComponent(cryptoName.trim())}`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    
    if (!searchData.coins || searchData.coins.length === 0) {
      return { error: `Crypto "${cryptoName}" non trouvée` };
    }
    
    const coinId = searchData.coins[0].id;
    const coinSymbol = searchData.coins[0].symbol.toUpperCase();
    const coinName = searchData.coins[0].name;
    
    const priceUrl = `${COINGECKO_API}/simple/price?ids=${coinId}&vs_currencies=usd,eur&include_24hr_change=true&include_market_cap=true`;
    const priceResponse = await fetch(priceUrl);
    const priceData = await priceResponse.json();
    
    if (!priceData[coinId]) {
      return { error: `Prix indisponible pour "${cryptoName}"` };
    }
    
    const data = priceData[coinId];
    return {
      success: true,
      coin: {
        name: coinName,
        symbol: coinSymbol,
        price_usd: data.usd,
        price_eur: data.eur,
        change_24h: data.usd_24h_change,
        market_cap: data.usd_market_cap
      }
    };
  } catch (error) {
    return { error: `Erreur API: ${error.message}` };
  }
}

// Outils disponibles
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'crypto_price',
    description: 'Prix de n\'importe quelle crypto via recherche dynamique CoinGecko',
    inputSchema: {
      type: 'object',
      properties: {
        crypto: { type: 'string', description: 'Nom ou ticker exact saisi par l\'utilisateur' }
      },
      required: ['crypto']
    }
  }]
}));

// Logique d'exécution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'crypto_price') {
    const result = await getCryptoPrice(request.params.arguments.crypto);
    
    if (result.error) {
      return { content: [{ type: 'text', text: `Erreur: ${result.error}` }] };
    }
    
    const coin = result.coin;
    const changeEmoji = coin.change_24h >= 0 ? '▲' : '▼';
    const changeSign = coin.change_24h >= 0 ? '+' : '';
    
    return {
      content: [{
        type: 'text',
        text: `**${coin.name} (${coin.symbol})**\n\n` +
              `USD: ${coin.price_usd.toLocaleString()}\n` +
              `EUR: €${coin.price_eur.toLocaleString()}\n` +
              `24h: ${changeEmoji} ${changeSign}${coin.change_24h.toFixed(2)}%\n` +
              `Market Cap: ${(coin.market_cap / 1e9).toFixed(2)}B\n\n` +
              `Source: CoinGecko API`
      }]
    };
  }
  throw new Error(`Outil inconnu: ${request.params.name}`);
});

// Démarrage
const transport = new StdioServerTransport();
await server.connect(transport);
console.log('Serveur MCP Crypto démarré - Recherche dynamique active');
