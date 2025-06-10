# Serveur MCP Crypto - Procédure OneShot

## Prérequis

### Environnement
- **VM Ubuntu 25.0 ARM**
- **MacOS** avec Claude installé
- **8GB RAM** min pour la VM
- **20GB espace disque** min

### Logiciels requis
- **Hyperviseur** (VMware)
- **Claude Desktop** installé sur la machine hôte

## Configuration VM Ubuntu + SSH

### Installation VM Ubuntu 25.0 ARM
```bash
# Premier boot VM - mettre à jour
sudo apt update && sudo apt upgrade -y

# Installation Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Installation SSH Server
sudo apt install -y openssh-server
sudo systemctl enable ssh
sudo systemctl start ssh

# Vérification services
node --version    # v20.x.x
npm --version     # 10.x.x
sudo systemctl status ssh    # active
```

### Configuration réseau VM
```bash
# Récupération IP VM
ip addr show | grep "inet " | grep -v 127.0.0.1

# Note: Retenir l'IP (ex: 192.168.64.10)
```

### Configuration SSH depuis la machine hôte
```bash
# machine hôte - Génération clé SSH
ssh-keygen -t ed25519 -C "mcp-vm"
# Appuyer Entrée pour tous les prompts (pas de passphrase)

# Copie clé vers VM (remplacer IP_VM)
ssh-copy-id user@IP_VM
# Saisir mot de passe VM une seule fois

# Test connexion sans mot de passe
ssh user@IP_VM "echo 'SSH configuré'"

# Test vitesse connexion (doit être < 5 sec)
time ssh user@IP_VM "echo test"
```

### Premier serveur MCP (test)
```bash
# VM Ubuntu - Serveur de base
mkdir ~/mcp-server && cd ~/mcp-server
npm install @modelcontextprotocol/sdk

# Serveur simple pour validation
echo '#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
const server = new Server({name: "test-server", version: "1.0.0"}, {capabilities: {tools: {}}});
const transport = new StdioServerTransport();
await server.connect(transport);
console.log("Serveur test OK");' > test-server.js

# Script de démarrage
echo '#!/bin/bash
cd ~/mcp-server
exec node test-server.js' > start-test.sh
chmod +x start-test.sh

# Test du serveur
ssh user@IP_VM "~/mcp-server/start-test.sh"
# Ctrl+C pour arrêter
```

### Validation prérequis
- [ ] VM Ubuntu 25.0 ARM opérationnelle
- [ ] Node.js 20+ installé
- [ ] SSH sans mot de passe fonctionnel
- [ ] Connexion SSH < 5 secondes
- [ ] Serveur MCP test répond

## 1. Création du projet crypto

```bash
# VM Ubuntu
mkdir ~/mcp-crypto-server && cd ~/mcp-crypto-server
npm init -y
npm install @modelcontextprotocol/sdk node-fetch
```

## 2. Serveur crypto

```bash
nano crypto-server.js
```

```javascript
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
```

## 3. Scripts de démarrage

```bash
# Script rapide pour Claude AI (évite timeout)
echo '#!/bin/bash
export NODE_ENV=production
cd ~/mcp-crypto-server
exec node crypto-server.js 2>/dev/null' > start-crypto.sh

chmod +x start-crypto.sh

# Test du serveur
node crypto-server.js
# Ctrl+C pour arrêter
```

## 4. Configuration de Claude AI

```bash
# Machine hôte - éditer la config
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/liam/Documents/05_LAB/IA/MCP"]
    },
    "ubuntu-server": {
      "command": "ssh",
      "args": ["-o", "ConnectTimeout=5", "user@192.168.116.133", "~/mcp-server/start-mcp.sh"]
    },
    "crypto-server": {
      "command": "ssh", 
      "args": ["-o", "ConnectTimeout=5", "user@192.168.116.133", "~/mcp-crypto-server/start-crypto.sh"]
    }
  }
}
```

## 5. Démarrage et test

```bash
# VM Ubuntu - serveur persistant (optionnel)
cd ~/mcp-crypto-server
nohup ./start-crypto.sh > crypto.log 2>&1 &

# Vérification
ps aux | grep node
```

**Test dans Claude AI :**
```
Donne-moi le prix du Bitcoin
Quel est le cours de "Shiba Inu" ?
Recherche "Polygon"
```

## Troubleshooting

| Problème | Cause | Solution |
|----------|-------|----------|
| `TimeoutError` | SSH trop lent | Serveur persistant + `-o ConnectTimeout=5` |
| `Module not found` | node-fetch manquant | `npm install node-fetch` |
| `Crypto non trouvée` | Nom inexact | Utiliser nom complet ou ticker officiel |
| `Connection refused` | SSH down | `sudo systemctl start ssh` |
| `fetch is not defined` | Import manquant | Vérifier `import fetch from 'node-fetch'` |
| Serveur ne répond pas | Process mort | `ps aux \| grep node` puis relancer |

## Logs utiles

```bash
# Claude AI logs
tail -f ~/Library/Logs/Claude/main.log

# Serveur crypto
tail -f ~/mcp-crypto-server/crypto.log

# Test SSH rapide
time ssh user@192.168.116.133 "echo test"
```

## Validation

- [ ] 3 serveurs dans Claude AI : filesystem, ubuntu-server, crypto-server
- [ ] Test crypto réussi avec Bitcoin
- [ ] Recherche dynamique fonctionnelle
- [ ] Temps de connexion < 5 secondes

---
**Stack :** Node.js • CoinGecko API • SSH • MCP Protocol
