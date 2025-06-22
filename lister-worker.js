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
