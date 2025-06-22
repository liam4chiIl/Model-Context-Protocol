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
