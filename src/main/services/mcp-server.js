/*
 * Simple MCP Server for testing and local tool execution
 * Implements basic Model Context Protocol over WebSocket
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { MCPTools } = require('./mcp-tools');

// MCPServer class to handle MCP connections and requests
class MCPServer {
  constructor(port = 3001) {
    this.port = port;
    this.server = null;
    this.clients = new Map();
    this.tools = new MCPTools();
    this.requestHandlers = new Map();
    this.setupRequestHandlers();
  }

  // Setup request handlers for MCP methods
  setupRequestHandlers() {
    this.requestHandlers.set('tools/list', async (params) => {
      const connectionType = params.connection_type || 'filesystem';
      const tools = this.tools.getToolsListForConnection(connectionType);
      return { tools };
    });

    this.requestHandlers.set('tools/call', async (params) => {
      const { connection_type, tool_name, arguments: toolArgs } = params;
      
      if (!connection_type || !tool_name) {
        throw new Error('Missing connection_type or tool_name');
      }

      try {
        const result = await this.tools.executeTool(connection_type, tool_name, toolArgs);
        return result;
      } catch (error) {
        throw new Error(`Tool execution failed: ${error.message}`);
      }
    });

    this.requestHandlers.set('connection/info', async () => {
      return {
        server: 'Mai Buddy MCP Server',
        version: '1.0.0',
        capabilities: {
          tools: true,
          resources: false,
          prompts: false
        },
        available_connections: [
          'filesystem',
          'terminal',
          'github',
          'calendar',
          'notion',
          'slack'
        ]
      };
    });

    this.requestHandlers.set('ping', async (params) => {
      return { pong: true, timestamp: new Date().toISOString() };
    });
  }

  // Start the MCP server
  async start() {
    this.server = new WebSocket.Server({ 
      port: this.port,
      perMessageDeflate: false
    });

    this.server.on('connection', (ws, req) => {
      const clientId = uuidv4();
      const client = {
        id: clientId,
        ws,
        ip: req.socket.remoteAddress,
        connectedAt: new Date().toISOString()
      };

      this.clients.set(clientId, client);
      console.log(`📡 MCP Client connected: ${clientId} from ${client.ip}`);

      this.sendMessage(client, {
        jsonrpc: '2.0',
        method: 'server/connected',
        params: {
          server: 'Mai Buddy MCP Server',
          client_id: clientId,
          capabilities: {
            tools: true,
            resources: false,
            prompts: false
          }
        }
      });

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleMessage(message, client);
        } catch (error) {
          console.error('Error parsing message:', error);
          this.sendError(client, null, 'Invalid JSON message');
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`MCP Client disconnected: ${clientId}`);
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
        this.clients.delete(clientId);
      });
    });

    console.log(`MCP Server started on ws://localhost:${this.port}`);
    return this.port;
  }

  // Handle incoming MCP messages
  async handleMessage(message, client) {
    const { jsonrpc, id, method, params } = message;

    if (jsonrpc !== '2.0') {
      this.sendError(client, id, 'Invalid JSON-RPC version');
      return;
    }

    if (!method) {
      this.sendError(client, id, 'Missing method');
      return;
    }

    const handler = this.requestHandlers.get(method);
    if (!handler) {
      this.sendError(client, id, `Unknown method: ${method}`);
      return;
    }

    try {
      const result = await handler(params || {}, client);
      
      if (id !== undefined) {
        this.sendMessage(client, {
          jsonrpc: '2.0',
          id,
          result
        });
      }
    } catch (error) {
      console.error('Error handling method:', method, error);
      this.sendError(client, id, error.message);
    }
  }

  // Send a JSON-RPC message to a client
  sendMessage(client, message) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  // Send a JSON-RPC error response to a client
  sendError(client, id, error) {
    this.sendMessage(client, {
      jsonrpc: '2.0',
      id,
      error: {
        code: -1,
        message: error
      }
    });
  }

  // Broadcast a message to all connected clients
  broadcast(message) {
    for (const client of this.clients.values()) {
      this.sendMessage(client, message);
    }
  }

  // Stop the MCP server
  stop() {
    if (this.server) {
      this.server.close();
      console.log('🛑 MCP Server stopped');
    }
  }

  // Get list of connected clients
  getConnectedClients() {
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      ip: client.ip,
      connectedAt: client.connectedAt
    }));
  }

  // Register a tool for a specific connection type
  registerTool(connectionType, toolName, toolDefinition) {
    this.tools.registerTool(connectionType, toolName, toolDefinition);
  }

  // Get tools available for a specific connection type
  getToolsForConnection(connectionType) {
    return this.tools.getToolsListForConnection(connectionType);
  }
}

module.exports = { MCPServer };
