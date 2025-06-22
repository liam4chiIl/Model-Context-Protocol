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
