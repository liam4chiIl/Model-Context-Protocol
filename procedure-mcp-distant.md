## Architecture du projet

```
MacBook Pro ←→ VM Ubuntu 
    ↓               ↓
[Claude Desktop]  [Serveur MCP]
```

Communication via SSH + protocole MCP STDIO.

---

## Étape 1 : Préparation de la VM Ubuntu

### Installation de Node.js

```bash
# Installation de Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Vérification des versions
node --version  # Attendu: v20.x.x
npm --version   # Attendu: 10.x.x
```

### Installation du serveur SSH

```bash
# Installation du serveur SSH
sudo apt install openssh-server -y

# Démarrage et activation du service
sudo systemctl start ssh
sudo systemctl enable ssh

# Vérification du statut
sudo systemctl status ssh
```

### Récupération de l'IP de la VM

```bash
ip addr show | grep inet
```

Notez l'adresse IP (ex: `192.168.1.100`) - vous en aurez besoin plus tard.

---

## Étape 2 : Création du serveur MCP

### Structure du projet

```bash
# Création du dossier projet
mkdir ~/mcp-server
cd ~/mcp-server
```

### Installation des dépendances MCP

```bash
npm install @modelcontextprotocol/sdk
```

### Création du serveur MCP

Créez le fichier `server.js` :

```bash
nano server.js
```

Copiez le code suivant :

```javascript
#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Création du serveur MCP
const server = new Server(
  {
    name: 'serveur-mcp-distant',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Définition des outils disponibles
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'dire_bonjour',
        description: 'Dit bonjour avec un message personnalisé depuis Ubuntu',
        inputSchema: {
          type: 'object',
          properties: {
            nom: {
              type: 'string',
              description: 'Le nom de la personne à saluer',
            },
          },
          required: ['nom'],
        },
      },
      {
        name: 'info_serveur',
        description: 'Donne des infos sur le serveur Ubuntu',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Logique d'exécution des outils
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'dire_bonjour') {
    const nom = request.params.arguments?.nom || 'Monde';
    return {
      content: [
        {
          type: 'text',
          text: ` Bonjour ${nom} ! Message envoyé depuis le serveur Ubuntu distant`,
        },
      ],
    };
  }
  
  if (request.params.name === 'info_serveur') {
    return {
      content: [
        {
          type: 'text',
          text: ` Serveur MCP Ubuntu\n• Status: Actif ✅\n• Protocol: MCP via SSH\n• Outils disponibles: 2`,
        },
      ],
    };
  }
  
  throw new Error(`Outil inconnu: ${request.params.name}`);
});

// Démarrage du serveur
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log('Serveur MCP démarré !');
}

main().catch(console.error);
```

### Script de démarrage persistant

```bash
# Création du script de démarrage
echo '#!/bin/bash
cd ~/mcp-server
exec node server.js' > start-mcp.sh

chmod +x start-mcp.sh
```

---

## Étape 3 : Configuration SSH depuis macOS

### Génération de clés SSH (si nécessaire)

```bash
# Sur votre Mac
ssh-keygen -t rsa -b 4096
```

### Copie de la clé sur la VM

```bash
# Remplacez par l'IP de votre VM
ssh-copy-id user@192.168.1.100
```

### Test de connexion

```bash
# Test de base
ssh user@192.168.1.100 "echo 'SSH fonctionne !'"

# Test du serveur MCP
ssh -o ConnectTimeout=5 user@192.168.1.100 "cd ~/mcp-server && node server.js"
```

---

## Étape 4 : Configuration de Claude Desktop

### Localisation du fichier de configuration

```bash
# Sur macOS
~/Library/Application Support/Claude/claude_desktop_config.json
```

### Configuration MCP

Éditez le fichier de configuration :

```bash
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

Configuration complète :

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/VOTRE_NOM/Documents/VOTRE_DOSSIER"
      ]
    },
    "ubuntu-server": {
      "command": "ssh",
      "args": [
        "user@192.168.1.100",
        "~/mcp-server/start-mcp.sh"
      ]
    }
  }
}
```

** Remplacez :**
- `VOTRE_NOM` par votre nom d'utilisateur
- `VOTRE_DOSSIER` par le chemin souhaité
- `192.168.1.100` par l'IP de votre VM

---

## Étape 5 : Démarrage et test

### Lancement du serveur sur la VM

```bash
# Sur la VM Ubuntu
cd ~/mcp-server
nohup ./start-mcp.sh > mcp.log 2>&1 &

# Vérification
ps aux | grep node
```

### Redémarrage de Claude Desktop

1. Fermez complètement Claude Desktop
2. Relancez l'application
3. Vérifiez dans les paramètres MCP que `ubuntu-server` apparaît

### Test des outils

Dans Claude Desktop, vous pouvez maintenant utiliser vos outils personnalisés :

```
Utilise l'outil dire_bonjour pour me saluer !
```

---

## Troubleshoot


### Problème 1 : "Server disconnected"

**Cause :** SSH non configuré ou serveur MCP non démarré

**Solution :**
```bash
# Vérifiez SSH
ssh user@192.168.1.100 "echo test"

# Vérifiez le serveur MCP
ssh user@192.168.1.100 "ps aux | grep node"
```

### Problème 2 : TimeoutError dans les logs Claude

**Cause :** Le serveur met trop de temps à démarrer

**Solution :** Utilisez le serveur persistant (étape 5.1)

### Problème 3 : "Module not found" 

**Cause :** Dépendances MCP non installées

**Solution :**
```bash
cd ~/mcp-server
npm install @modelcontextprotocol/sdk
```

### Problème 4 : "Connection refused" sur port 22

**Cause :** SSH non installé/démarré sur Ubuntu

**Solution :**
```bash
sudo apt install openssh-server -y
sudo systemctl start ssh
sudo systemctl enable ssh
```

---

## Vérification des logs

### Logs Claude Desktop (macOS)

```bash
tail -f ~/Library/Logs/Claude/main.log
```

### Logs serveur MCP (VM Ubuntu)

```bash
tail -f ~/mcp-server/mcp.log
```

### Logs SSH (VM Ubuntu)

```bash
sudo tail -f /var/log/auth.log
```

---

Cette configuration permet de :
- Séparer les ressources de calcul
- Créer des outils spécialisés sur différents serveurs
- Maintenir la sécurité via SSH



Si vous voulez créer ou ajouter des outils, il faudra modifier le fichier `server.js` en ajoutant de nouveaux outils dans les sections :
- `ListToolsRequestSchema` (déclaration)
- `CallToolRequestSchema` (logique)

Vous avez maintenant un serveur MCP distant fonctionnel qui permet à Claude d'exécuter des outils personnalisés sur votre VM Ubuntu. Cette architecture ouvre de nombreuses possibilités pour créer des workflows automatisés et des intégrations personnalisées.
