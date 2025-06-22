# Guide d'Intégration MCP-N8N pour Infrastructure Multi-Serveurs

## Vue d'ensemble

Dans ce guide, je vous présente comment faire un déploiement complet d'une infra MCP (Model Context Protocol) permettant le contrôle d'un serveur N8N depuis un client MCP distant.
L'architecture distribuée utilise trois machines distinctes pour une séparation claire des responsabilités, une sécurité optimisée et une facilité d'évolution.


### Architecture cible

- **Client MCP** : PC Hôte avec Dive AI (192.168.1.24)
- **Serveurs MCP** : srv-mcp hébergeant les serveurs MCP (192.168.1.25)  
- **Serveur N8N** : srv-n8n hébergeant l'instance N8N (192.168.1.26)

### Fonctionnalités implémentées

L'intégration fournit quatre outils MCP distincts pour une gestion complète des workflows N8N :

1. **Lister les workflows** : Récupération de tous les workflows avec leurs métadonnées
2. **Statut détaillé** : Analyse approfondie d'un workflow et de ses exécutions
3. **Exécution de workflow** : Démarrage contrôlé d'un workflow spécifique
4. **Arrêt de workflow** : Interruption sécurisée des exécutions en cours

---

## Phase 1 : Configuration de l'infrastructure SSH

### Objectif
Établir un système d'authentification SSH par clés pour permettre les communications sécurisées entre toutes les machines sans intervention manuelle.

### Configuration des services SSH

#### Sur srv-n8n (serveur N8N)
```bash
# Installation et activation du service SSH
sudo apt update
sudo apt install -y openssh-server

# Activation permanente du service
sudo systemctl enable ssh
sudo systemctl start ssh

# Configuration du pare-feu pour autoriser SSH
sudo ufw allow 22
sudo ufw --force enable
```

#### Sur srv-mcp (serveur MCP)
```bash
# Configuration identique pour le serveur MCP
sudo apt update
sudo apt install -y openssh-server
sudo systemctl enable ssh
sudo systemctl start ssh
sudo ufw allow 22
sudo ufw --force enable
```

### Génération et déploiement des clés SSH

#### Clé d'authentification PC Hôte → srv-mcp
```bash
# Génération d'une clé spécifique pour la connexion MCP
ssh-keygen -t ed25519 -C "dive-ai-mcp" -f ~/.ssh/id_dive_mcp
```
*Note : Appuyer sur Entrée pour tous les prompts (pas de passphrase pour l'automatisation)*

```bash
# Déploiement de la clé publique sur le serveur MCP
ssh-copy-id -i ~/.ssh/id_dive_mcp.pub user@192.168.1.25

# Validation de la connexion automatique
ssh -i ~/.ssh/id_dive_mcp user@192.168.1.25 "echo 'Connexion PC Hôte vers srv-mcp établie'"
```

#### Clé d'authentification H^ote → srv-n8n
```bash
# Génération d'une clé dédiée pour l'accès direct à N8N
ssh-keygen -t ed25519 -C "hote-to-n8n" -f ~/.ssh/id_n8n_direct

# Déploiement sur le serveur N8N
ssh-copy-id -i ~/.ssh/id_n8n_direct.pub user@192.168.1.26

# Test de connexion directe
ssh -i ~/.ssh/id_n8n_direct user@192.168.1.26 "echo 'Connexion hote vers srv-n8n établie'"
```

#### Clé d'authentification srv-mcp → srv-n8n
```bash
# Connexion au serveur MCP pour générer la clé inter-serveurs
ssh user@192.168.1.25

# Génération de la clé sur srv-mcp
ssh-keygen -t ed25519 -C "mcp-to-n8n" -f ~/.ssh/id_n8n -N ""

# Déploiement vers srv-n8n
ssh-copy-id -i ~/.ssh/id_n8n.pub user@192.168.1.26

# Validation de la connexion inter-serveurs
ssh -i ~/.ssh/id_n8n user@192.168.1.26 "echo 'Connexion srv-mcp vers srv-n8n établie'"
```

### Configuration des fichiers SSH config

#### Configuration sur PC Hôte (~/.ssh/config)
```bash
cat >> ~/.ssh/config << 'EOF'

# Configuration optimisée pour srv-mcp
Host srv-mcp
    HostName 192.168.1.25
    User user
    IdentityFile ~/.ssh/id_dive_mcp
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
    PasswordAuthentication no

# Configuration optimisée pour srv-n8n
Host srv-n8n
    HostName 192.168.1.26
    User user
    IdentityFile ~/.ssh/id_n8n_direct
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
    PasswordAuthentication no
EOF
```

#### Configuration sur srv-mcp (~/.ssh/config)
```bash
# Connexion préalable au serveur MCP
ssh user@192.168.1.25

# Configuration pour l'accès à N8N depuis le serveur MCP
cat >> ~/.ssh/config << 'EOF'

# Configuration pour srv-n8n depuis srv-mcp
Host srv-n8n
    HostName 192.168.1.26
    User user
    IdentityFile ~/.ssh/id_n8n
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
    PasswordAuthentication no
EOF
```

---

## Phase 2 : Installation et configuration de N8N

### Objectif
Déployer une instance N8N accessible via API avec authentification JWT, configurée pour un accès programmatique depuis les serveurs MCP.

### Installation de l'environnement Node.js

```bash
# Connexion au serveur N8N
ssh user@192.168.1.26

# Installation de Node.js 20 LTS via le gestionnaire de paquets officiel
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Vérification des versions installées
node --version
npm --version
```

### Installation et configuration de N8N

```bash
# Installation globale de N8N
sudo npm install -g n8n

# Vérification de l'installation
which n8n
n8n --version
```

### Configuration du service système N8N

```bash
# Création du fichier de service systemd avec configuration optimisée
sudo tee /etc/systemd/system/n8n.service > /dev/null << 'EOF'
[Unit]
Description=N8N Workflow Automation
After=network.target

[Service]
Type=simple
User=user
# Configuration réseau pour accès externe
Environment=N8N_HOST=0.0.0.0
Environment=N8N_PORT=5678
# Configuration sécurité désactivée pour l'environnement de développement
Environment=N8N_SECURE_COOKIE=false
Environment=N8N_USER_MANAGEMENT_DISABLED=true
Environment=N8N_BASIC_AUTH_ACTIVE=false
Environment=N8N_DISABLE_UI=false
Environment=NODE_ENV=development
ExecStart=/usr/bin/n8n start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
```

### Activation et test du service N8N

```bash
# Rechargement de la configuration systemd
sudo systemctl daemon-reload

# Activation et démarrage du service
sudo systemctl enable n8n
sudo systemctl start n8n

# Configuration du pare-feu pour l'API N8N
sudo ufw allow 5678
sudo ufw status

# Vérification du statut (délai d'attente pour l'initialisation)
sleep 30
sudo systemctl status n8n

# Test de l'API locale
curl http://localhost:5678/api/v1/workflows
```

### Test de connectivité externe

```bash
# Test depuis l'hote pour valider l'accès réseau
curl http://192.168.1.26:5678/api/v1/workflows
```

### Configuration de l'authentification JWT

1. **Accès à l'interface web** : Ouvrir http://192.168.1.26:5678 dans un navigateur
2. **Génération du JWT** : L'interface N8N sans authentification permet la génération automatique d'un token JWT
3. **Récupération du token** : Copier le JWT généré (format: eyJxxxxx...) pour la configuration des serveurs MCP

---

## Phase 3 : Développement et déploiement des serveurs MCP

### Objectif
Implémenter quatre serveurs MCP spécialisés, chacun gérant une fonctionnalité spécifique de contrôle des workflows N8N via l'API REST.

### Préparation de l'environnement de développement

```bash
# Connexion au serveur MCP
ssh user@192.168.1.25

# Installation de Node.js (même configuration que N8N)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Vérification des versions
node --version
npm --version

# Création de la structure de projet
mkdir -p /home/user/mcp-server
cd /home/user/mcp-server
```

### Configuration des dépendances

```bash
# Création du fichier package.json avec dépendances minimales
cat > package.json << 'EOF'
{
  "name": "mcp-n8n-server",
  "version": "1.0.0",
  "type": "commonjs",
  "dependencies": {
    "@modelcontextprotocol/sdk": "0.4.0",
    "axios": "1.6.0"
  }
}
EOF

# Installation des dépendances
npm install

# Validation de l'installation du SDK MCP
npm list @modelcontextprotocol/sdk
node -e "console.log('SDK Version:', require('@modelcontextprotocol/sdk/package.json').version)"
```

### Serveur MCP 1 : Énumération des workflows

Ce serveur implémente la récupération complète de tous les workflows avec leurs métadonnées.

```bash
cat > lister-workflows.js << 'EOF'
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode
} = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');

// Initialisation du serveur MCP avec métadonnées
const mcpServer = new Server(
  { name: 'lister-workflows-n8n', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Déclaration des outils disponibles
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'lister_workflows',
    description: 'Liste tous les workflows N8N disponibles avec leurs détails',
    inputSchema: { type: 'object', properties: {} }
  }]
}));

// Gestionnaire principal des appels d'outils
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const N8N_URL = 'http://192.168.1.26:5678';
  const JWT_TOKEN = 'VOTRE_JWT_TOKEN_N8N';
  
  try {
    // Requête à l'API N8N avec authentification JWT
    const response = await axios.get(`${N8N_URL}/api/v1/workflows`, { 
      timeout: 10000,
      headers: {
        'X-N8N-API-KEY': JWT_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    const workflows = response.data.data || [];
    
    // Formatage de la réponse avec métadonnées enrichies
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'succès',
          serveur: 'N8N API avec JWT',
          total: workflows.length,
          workflows: workflows.map(w => ({
            id: w.id,
            nom: w.name,
            actif: w.active,
            tags: w.tags || [],
            dateCreation: w.createdAt,
            derniereModification: w.updatedAt
          }))
        }, null, 2)
      }]
    };
  } catch (error) {
    throw new McpError(ErrorCode.InternalError, `Erreur lors de la récupération des workflows: ${error.message}`);
  }
});

// Initialisation du transport et connexion
async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch(console.error);
EOF
```

### Serveur MCP 2 : Analyse de statut détaillé

Ce serveur fournit une analyse approfondie d'un workflow spécifique incluant ses statistiques d'exécution.

```bash
cat > statut-workflow.js << 'EOF'
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode
} = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');

const mcpServer = new Server(
  { name: 'statut-workflow-n8n', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'statut_workflow',
    description: 'Affiche les informations détaillées et le statut d\'un workflow N8N',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string', description: 'ID du workflow à examiner' }
      },
      required: ['workflowId']
    }
  }]
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { arguments: args } = request.params;
  const N8N_URL = 'http://192.168.1.26:5678';
  const JWT_TOKEN = 'VOTRE_JWT_TOKEN_N8N';
  
  try {
    // Récupération des détails du workflow
    const workflowResp = await axios.get(`${N8N_URL}/api/v1/workflows/${args.workflowId}`, { 
      timeout: 10000,
      headers: {
        'X-N8N-API-KEY': JWT_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    const workflow = workflowResp.data.data;
    
    // Récupération de l'historique des exécutions
    const execResp = await axios.get(`${N8N_URL}/api/v1/executions`, {
      params: {
        filter: JSON.stringify({ workflowId: args.workflowId }),
        limit: 5
      },
      timeout: 15000,
      headers: {
        'X-N8N-API-KEY': JWT_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    const executions = execResp.data.data || [];

    // Compilation des statistiques et analyse
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'succès',
          workflow: {
            id: workflow.id,
            nom: workflow.name,
            actif: workflow.active,
            nombreNoeuds: workflow.nodes?.length || 0,
            tags: workflow.tags || [],
            dateCreation: workflow.createdAt,
            derniereModification: workflow.updatedAt
          },
          statistiques: {
            totalExecutions: executions.length,
            executionsReussies: executions.filter(e => e.status === 'success').length,
            executionsEchouees: executions.filter(e => e.status === 'error').length,
            executionsEnCours: executions.filter(e => e.status === 'running').length
          },
          dernieresExecutions: executions.map(e => ({
            id: e.id,
            statut: e.status,
            mode: e.mode,
            debut: e.startedAt,
            fin: e.stoppedAt,
            dureeMs: e.stoppedAt && e.startedAt ? 
              new Date(e.stoppedAt) - new Date(e.startedAt) : null
          }))
        }, null, 2)
      }]
    };
  } catch (error) {
    if (error.response?.status === 404) {
      throw new McpError(ErrorCode.InvalidParams, `Workflow avec ID "${args.workflowId}" non trouvé`);
    }
    throw new McpError(ErrorCode.InternalError, `Erreur lors de la récupération du statut: ${error.message}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch(console.error);
EOF
```

### Serveur MCP 3 : Exécution de workflow

Ce serveur gère le démarrage contrôlé des workflows avec suivi de l'état d'exécution.

```bash
cat > executer-workflow.js << 'EOF'
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode
} = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');

const mcpServer = new Server(
  { name: 'executer-workflow-n8n', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'executer_workflow',
    description: 'Démarre l\'exécution d\'un workflow N8N spécifique',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string', description: 'ID du workflow à exécuter' }
      },
      required: ['workflowId']
    }
  }]
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { arguments: args } = request.params;
  const N8N_URL = 'http://192.168.1.26:5678';
  const JWT_TOKEN = 'VOTRE_JWT_TOKEN_N8N';
  
  try {
    // Démarrage de l'exécution via l'API N8N
    const execResp = await axios.post(`${N8N_URL}/api/v1/workflows/${args.workflowId}/execute`, {}, {
      timeout: 30000,
      headers: {
        'X-N8N-API-KEY': JWT_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    // Confirmation du démarrage avec métadonnées d'exécution
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'démarré avec succès',
          workflowId: args.workflowId,
          executionId: execResp.data.data?.executionId || 'ID non disponible',
          message: `Workflow ${args.workflowId} lancé avec succès`,
          heureExecution: new Date().toLocaleString('fr-FR'),
          details: 'L\'exécution est en cours, utilisez la fonction statut pour suivre les progrès'
        }, null, 2)
      }]
    };
  } catch (error) {
    if (error.response?.status === 404) {
      throw new McpError(ErrorCode.InvalidParams, `Workflow avec ID "${args.workflowId}" non trouvé`);
    }
    throw new McpError(ErrorCode.InternalError, `Erreur lors du démarrage: ${error.message}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch(console.error);
EOF
```

### Serveur MCP 4 : Arrêt sécurisé de workflow

Ce serveur implémente l'arrêt contrôlé des exécutions en cours avec gestion des états multiples.

```bash
cat > arreter-workflow.js << 'EOF'
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode
} = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');

const mcpServer = new Server(
  { name: 'arreter-workflow-n8n', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'arreter_workflow',
    description: 'Arrête toutes les exécutions en cours d\'un workflow N8N',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string', description: 'ID du workflow à arrêter' }
      },
      required: ['workflowId']
    }
  }]
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { arguments: args } = request.params;
  const N8N_URL = 'http://192.168.1.26:5678';
  const JWT_TOKEN = 'VOTRE_JWT_TOKEN_N8N';
  
  try {
    // Recherche des exécutions en cours pour le workflow spécifié
    const runningResp = await axios.get(`${N8N_URL}/api/v1/executions`, {
      params: {
        filter: JSON.stringify({ workflowId: args.workflowId, status: 'running' }),
        limit: 10
      },
      timeout: 15000,
      headers: {
        'X-N8N-API-KEY': JWT_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    const runningExecutions = runningResp.data.data || [];
    
    // Vérification de l'existence d'exécutions en cours
    if (runningExecutions.length === 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'aucune exécution en cours',
            workflowId: args.workflowId,
            message: 'Aucune exécution en cours trouvée pour ce workflow',
            executionsTrouvees: 0,
            executionsArretees: 0
          }, null, 2)
        }]
      };
    }

    // Arrêt séquentiel de toutes les exécutions en cours
    const stopResults = [];
    for (const execution of runningExecutions) {
      try {
        await axios.post(`${N8N_URL}/api/v1/executions/${execution.id}/stop`, {}, { 
          timeout: 15000,
          headers: {
            'X-N8N-API-KEY': JWT_TOKEN,
            'Content-Type': 'application/json'
          }
        });
        stopResults.push({ 
          executionId: execution.id, 
          statut: 'arrêté avec succès' 
        });
      } catch (e) {
        stopResults.push({ 
          executionId: execution.id, 
          statut: 'erreur', 
          details: e.message 
        });
      }
    }

    const successCount = stopResults.filter(r => r.statut === 'arrêté avec succès').length;

    // Rapport détaillé des opérations d'arrêt
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'opération terminée',
          workflowId: args.workflowId,
          executionsTrouvees: runningExecutions.length,
          executionsArretees: successCount,
          message: `${successCount}/${runningExecutions.length} exécution(s) arrêtée(s) avec succès`,
          resultatsDetailles: stopResults
        }, null, 2)
      }]
    };
  } catch (error) {
    throw new McpError(ErrorCode.InternalError, `Erreur lors de l'arrêt: ${error.message}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch(console.error);
EOF
```

### Configuration des tokens JWT

```bash
# Remplacement du placeholder JWT par le token réel dans tous les serveurs
# IMPORTANT: Remplacer 'votre_jwt_complet' par le JWT généré depuis l'interface N8N
JWT_TOKEN="eyJxxxxx_votre_jwt_complet_xxxxx"

sed -i "s/VOTRE_JWT_TOKEN_N8N/$JWT_TOKEN/g" lister-workflows.js
sed -i "s/VOTRE_JWT_TOKEN_N8N/$JWT_TOKEN/g" statut-workflow.js  
sed -i "s/VOTRE_JWT_TOKEN_N8N/$JWT_TOKEN/g" executer-workflow.js
sed -i "s/VOTRE_JWT_TOKEN_N8N/$JWT_TOKEN/g" arreter-workflow.js
```

### Validation des serveurs MCP

```bash
# Vérification de la structure des fichiers
ls -la /home/user/mcp-server/

# Test individualisé de chaque serveur MCP
cd /home/user/mcp-server

echo '{}' | timeout 5s node lister-workflows.js
echo "Test serveur 1 (lister) OK"

echo '{}' | timeout 5s node statut-workflow.js
echo "Test serveur 2 (statut) OK"

echo '{}' | timeout 5s node executer-workflow.js
echo "Test serveur 3 (exécuter) OK"

echo '{}' | timeout 5s node arreter-workflow.js
echo "Test serveur 4 (arrêter) OK"

echo "Validation complète : tous les serveurs MCP sont opérationnels"
```

---

## Phase 4 : Intégration avec le client MCP (Dive AI)

### Objectif
Configurer le client MCP pour utiliser les serveurs distants via SSH avec authentification par clés, permettant l'exécution transparente des outils N8N.

### Tests préalables de connectivité

```bash
# Identification de l'utilisateur local
echo $USER

# Validation de l'API N8N avec JWT
curl -H "X-N8N-API-KEY: VOTRE_JWT_TOKEN_N8N" http://192.168.1.26:5678/api/v1/workflows
echo "L'API N8N doit retourner la liste des workflows"

# Vérification de la structure MCP distante
ssh -i ~/.ssh/id_dive_mcp user@192.168.1.25 "ls -la /home/user/mcp-server/"
echo "Validation : 4 fichiers .js et les dépendances npm doivent être présents"

# Test fonctionnel d'un serveur MCP avec JWT
ssh -i ~/.ssh/id_dive_mcp user@192.168.1.25 "cd /home/user/mcp-server && echo '{}' | timeout 5s node lister-workflows.js"
echo "Le serveur doit retourner la liste formatée des workflows N8N"
```

### Configuration des outils MCP dans Dive AI

Les configurations suivantes doivent être ajoutées via le gestionnaire d'outils MCP de Dive AI (Tools Manager → Add MCP Tools).

**Note importante** : Remplacer `[VOTRE_USER]` par le nom d'utilisateur Mac obtenu avec `echo $USER`.

#### Configuration 1 : Outil de listage des workflows

**Nom de l'outil** : `Lister Workflows N8N`

**Configuration JSON** :
```json
{
  "mcpServers": {
    "Lister Workflows N8N": {
      "transport": "stdio",
      "enabled": true,
      "command": "ssh",
      "args": [
        "-i",
        "/Users/[VOTRE_USER]/.ssh/id_dive_mcp",
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "user@192.168.1.25",
        "cd /home/user/mcp-server && node lister-workflows.js"
      ],
      "env": {},
      "url": null,
      "headers": null
    }
  }
}
```

#### Configuration 2 : Outil d'analyse de statut

**Nom de l'outil** : `Statut Workflow N8N`

**Configuration JSON** :
```json
{
  "mcpServers": {
    "Statut Workflow N8N": {
      "transport": "stdio",
      "enabled": true,
      "command": "ssh",
      "args": [
        "-i",
        "/Users/[VOTRE_USER]/.ssh/id_dive_mcp",
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "user@192.168.1.25",
        "cd /home/user/mcp-server && node statut-workflow.js"
      ],
      "env": {},
      "url": null,
      "headers": null
    }
  }
}
```

#### Configuration 3 : Outil d'exécution de workflow

**Nom de l'outil** : `Executer Workflow N8N`

**Configuration JSON** :
```json
{
  "mcpServers": {
    "Executer Workflow N8N": {
      "transport": "stdio",
      "enabled": true,
      "command": "ssh",
      "args": [
        "-i",
        "/Users/[VOTRE_USER]/.ssh/id_dive_mcp",
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "user@192.168.1.25",
        "cd /home/user/mcp-server && node executer-workflow.js"
      ],
      "env": {},
      "url": null,
      "headers": null
    }
  }
}
```

#### Configuration 4 : Outil d'arrêt de workflow

**Nom de l'outil** : `Arreter Workflow N8N`

**Configuration JSON** :
```json
{
  "mcpServers": {
    "Arreter Workflow N8N": {
      "transport": "stdio",
      "enabled": true,
      "command": "ssh",
      "args": [
        "-i",
        "/Users/[VOTRE_USER]/.ssh/id_dive_mcp",
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "user@192.168.1.25",
        "cd /home/user/mcp-server && node arreter-workflow.js"
      ],
      "env": {},
      "url": null,
      "headers": null
    }
  }
}
```

### Validation finale de l'intégration

Après la configuration des quatre outils dans Dive AI, effectuer les tests suivants :

1. **Test de listage** : Demander à Dive AI de lister tous les workflows N8N
2. **Test de statut** : Analyser le statut détaillé d'un workflow spécifique
3. **Test d'exécution** : Démarrer un workflow et vérifier le retour d'information
4. **Test d'arrêt** : Arrêter les exécutions en cours et valider les rapports

---

## Guide de paramétrage

### Variables à personnaliser

Avant de déployer cette procédure, les éléments suivants doivent être adaptés à votre environnement :

| Variable | Description | Emplacement | Exemple |
|----------|-------------|-------------|---------|
| `192.168.1.24` | Adresse IP du PC Hôte client | Architecture réseau | `10.0.1.100` |
| `192.168.1.25` | Adresse IP du serveur MCP | Architecture réseau | `10.0.1.101` |
| `192.168.1.26` | Adresse IP du serveur N8N | Architecture réseau | `10.0.1.102` |
| `user` | Nom d'utilisateur sur les serveurs | Comptes système | `admin`, `deploy` |
| `[VOTRE_USER]` | Nom d'utilisateur PC Hôte | Configuration Dive AI | `john.doe` |
| `VOTRE_JWT_TOKEN_N8N` | Token JWT / API Key généré par N8N | Scripts MCP | `eyJhbGciOiJIUzI1NiI...` |

### Ports réseau requis

| Service | Port | Description | Protocole |
|---------|------|-------------|-----------|
| SSH | 22 | Authentification et tunneling | TCP |
| N8N API | 5678 | Interface REST N8N | TCP |
| N8N WebUI | 5678 | Interface web (optionnel) | TCP |

### Prérequis système

#### Sur toutes les machines
- **Système d'exploitation** : Ubuntu 20.04 LTS ou supérieur
- **Mémoire** : Minimum 2 GB RAM
- **Espace disque** : Minimum 10 GB disponible
- **Réseau** : Connectivité entre toutes les machines

#### Sur PC Hôte (client MCP)
- **Dive AI** : Version compatible MCP
- **SSH client** : OpenSSH 7.4 ou supérieur
- **Accès réseau** : Sortant vers ports 22 et 5678

#### Sur srv-mcp (serveurs MCP)
- **Node.js** : Version 20 LTS
- **npm** : Version 9 ou supérieur
- **Mémoire** : 1 GB RAM minimum pour les serveurs MCP

#### Sur srv-n8n (serveur N8N)
- **Node.js** : Version 20 LTS
- **npm** : Version 9 ou supérieur
- **Mémoire** : 2 GB RAM minimum pour N8N

---

## Guide de dépannage

### Problèmes de connectivité SSH

#### Symptôme : "Permission denied (publickey)"
```bash
# Diagnostic
ssh -v user@IP_SERVER

# Solutions
# 1. Vérifier les permissions des clés
chmod 600 ~/.ssh/id_*
chmod 644 ~/.ssh/id_*.pub

# 2. Vérifier la configuration SSH
cat ~/.ssh/config

# 3. Tester avec agent SSH
ssh-add ~/.ssh/id_dive_mcp
ssh-add -l
```

#### Symptôme : "Connection refused"
```bash
# Diagnostic du service SSH distant
ssh user@IP_SERVER "sudo systemctl status ssh"

# Vérification du pare-feu
ssh user@IP_SERVER "sudo ufw status"

# Redémarrage du service SSH si nécessaire
ssh user@IP_SERVER "sudo systemctl restart ssh"
```

### Problèmes avec l'API N8N

#### Symptôme : "401 Unauthorized" ou "403 Forbidden"
```bash
# Vérification du token JWT
curl -H "X-N8N-API-KEY: VOTRE_JWT" http://IP_N8N:5678/api/v1/workflows

# Régénération du token depuis l'interface N8N
# Mise à jour dans tous les scripts MCP
grep -r "JWT_TOKEN" /home/user/mcp-server/
```

#### Symptôme : "Connection timeout" vers N8N
```bash
# Test de connectivité réseau
telnet IP_N8N 5678

# Vérification du service N8N
ssh user@IP_N8N "sudo systemctl status n8n"

# Analyse des logs N8N
ssh user@IP_N8N "sudo journalctl -u n8n -f"
```

### Problèmes avec les serveurs MCP

#### Symptôme : "Module not found" ou erreurs de dépendances
```bash
# Vérification des dépendances
cd /home/user/mcp-server
npm list

# Réinstallation complète
rm -rf node_modules package-lock.json
npm install

# Test individuel des serveurs
echo '{}' | node lister-workflows.js
```

#### Symptôme : Timeout des serveurs MCP
```bash
# Augmentation des timeouts dans les configurations Dive AI
# Modification des valeurs timeout dans les scripts MCP
sed -i 's/timeout: 10000/timeout: 30000/g' *.js

# Test avec timeout étendu
echo '{}' | timeout 30s node lister-workflows.js
```

### Problèmes de configuration Dive AI

#### Symptôme : "Failed to start MCP server"
```bash
# Vérification des chemins dans la configuration JSON
ls -la /Users/[VOTRE_USER]/.ssh/id_dive_mcp

# Test manuel de la commande SSH
ssh -i /Users/[VOTRE_USER]/.ssh/id_dive_mcp user@192.168.1.25 "cd /home/user/mcp-server && node lister-workflows.js"

# Vérification des logs Dive AI (selon la plateforme)
```

#### Symptôme : "Tool not responding"
```bash
# Diagnostic de la chaîne complète
# 1. Test SSH
ssh user@192.168.1.25 "echo 'SSH OK'"

# 2. Test Node.js distant
ssh user@192.168.1.25 "node --version"

# 3. Test serveur MCP spécifique
ssh user@192.168.1.25 "cd /home/user/mcp-server && echo '{}' | node lister-workflows.js"
```

### Commandes de diagnostic système

#### Surveillance des performances
```bash
# Monitoring des ressources sur srv-mcp
ssh user@192.168.1.25 "top -n1 | head -10"

# Monitoring des ressources sur srv-n8n
ssh user@192.168.1.26 "top -n1 | head -10"

# Analyse de l'utilisation réseau
netstat -tuln | grep -E ':(22|5678)'
```

#### Logs et debugging
```bash
# Logs système N8N
ssh user@192.168.1.26 "sudo journalctl -u n8n --since '1 hour ago'"

# Logs SSH pour debugging
ssh -vvv user@192.168.1.25

# Test des serveurs MCP avec logging détaillé
ssh user@192.168.1.25 "cd /home/user/mcp-server && DEBUG=* node lister-workflows.js"
```

### Procédures de récupération

#### Réinitialisation complète de l'environnement N8N
```bash
ssh user@192.168.1.26
sudo systemctl stop n8n
sudo systemctl disable n8n
sudo rm /etc/systemd/system/n8n.service
sudo systemctl daemon-reload

# Réinstallation selon la Phase 2
```

#### Réinitialisation des serveurs MCP
```bash
ssh user@192.168.1.25
rm -rf /home/user/mcp-server
mkdir -p /home/user/mcp-server

# Redéploiement selon la Phase 3
```

#### Réinitialisation des clés SSH
```bash
# Sur Hôte
rm ~/.ssh/id_dive_mcp*
rm ~/.ssh/id_n8n_direct*

# Regénération selon la Phase 1
```

---

## Maintenance et optimisation

### Mise à jour des composants

#### Mise à jour de N8N
```bash
ssh user@192.168.1.26
sudo systemctl stop n8n
sudo npm update -g n8n
sudo systemctl start n8n
```

#### Mise à jour du SDK MCP
```bash
ssh user@192.168.1.25
cd /home/user/mcp-server
npm update @modelcontextprotocol/sdk
```

### Monitoring proactif

#### Script de vérification de santé
```bash
#!/bin/bash
# health_check.sh

echo "=== Vérification de l'écosystème MCP-N8N ==="

# Test connectivité SSH
ssh -o ConnectTimeout=5 user@192.168.1.25 "echo 'srv-mcp: OK'" || echo "srv-mcp: ERREUR"
ssh -o ConnectTimeout=5 user@192.168.1.26 "echo 'srv-n8n: OK'" || echo "srv-n8n: ERREUR"

# Test API N8N
curl -s -m 10 http://192.168.1.26:5678/api/v1/workflows > /dev/null && echo "N8N API: OK" || echo "N8N API: ERREUR"

# Test serveurs MCP
ssh user@192.168.1.25 "cd /home/user/mcp-server && echo '{}' | timeout 10s node lister-workflows.js" > /dev/null && echo "Serveurs MCP: OK" || echo "Serveurs MCP: ERREUR"

echo "=== Fin de la vérification ==="
```

Cette procédure fournit un framework complet pour l'implémentation d'une infrastructure MCP-N8N distribuée, avec tous les éléments nécessaires pour un déploiement en production et une maintenance efficace.
