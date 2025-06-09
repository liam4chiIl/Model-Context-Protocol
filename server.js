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
          text: `🎉 Bonjour ${nom} ! Message envoyé depuis le serveur Ubuntu distant`,
        },
      ],
    };
  }
  
  if (request.params.name === 'info_serveur') {
    return {
      content: [
        {
          type: 'text',
          text: `📊 Serveur MCP Ubuntu\n• Status: Actif ✅\n• Protocol: MCP via SSH\n• Outils disponibles: 2`,
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
