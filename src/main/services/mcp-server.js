/**
 * MCP Server
 * Handles MCP connections and requests over WebSocket.
 * Implements basic Model Context Protocol with JSON-RPC 2.0.
 * 
 * Author: DJ Leamen, 2025-2026
 */
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { MCPTools } = require('./mcp-tools');

/**
 * MCPServer class to handle MCP connections and requests over WebSocket.
 * Implements basic Model Context Protocol with JSON-RPC 2.0.
 */
class MCPServer {
  constructor(port = 3001) {
    /**
     * Creates an MCPServer instance.
     * 
     * @param {number} [port=3001] - The port to run the server on.
     */
    this.port = port;
    this.server = null;
    this.clients = new Map();
    this.tools = new MCPTools();
    this.requestHandlers = new Map();
    this.setupRequestHandlers();
  }

  setupRequestHandlers() {
    /**
     * Sets up request handlers for MCP methods.
     * Registers handlers for tools/list, tools/call, connection/info, and ping.
     * 
     * @returns {void}
     */
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

  async start() {
    /**
     * Starts the MCP server and listens for WebSocket connections.
     * 
     * @async
     * @returns {Promise<number>} The port the server is listening on.
     */
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

  async handleMessage(message, client) {
    /**
     * Handles incoming MCP messages and routes them to appropriate handlers.
     * 
     * @async
     * @param {Object} message - The JSON-RPC 2.0 message.
     * @param {Object} client - The client connection object.
     * @returns {Promise<void>}
     */
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

  sendMessage(client, message) {
    /**
     * Sends a JSON-RPC message to a client.
     * 
     * @param {Object} client - The client connection object.
     * @param {Object} message - The message to send.
     * @returns {void}
     */
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  sendError(client, id, error) {
    /**
     * Sends a JSON-RPC error response to a client.
     * 
     * @param {Object} client - The client connection object.
     * @param {string|number} id - The request ID.
     * @param {string} error - The error message.
     * @returns {void}
     */
    this.sendMessage(client, {
      jsonrpc: '2.0',
      id,
      error: {
        code: -1,
        message: error
      }
    });
  }

  broadcast(message) {
    /**
     * Broadcasts a message to all connected clients.
     * 
     * @param {Object} message - The message to broadcast.
     * @returns {void}
     */
    for (const client of this.clients.values()) {
      this.sendMessage(client, message);
    }
  }

  stop() {
    /**
     * Stops the MCP server and closes all connections.
     * 
     * @returns {void}
     */
    if (this.server) {
      this.server.close();
      console.log('🛑 MCP Server stopped');
    }
  }

  getConnectedClients() {
    /**
     * Gets list of connected clients.
     * 
     * @returns {Array<Object>} Array of client information objects.
     */
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      ip: client.ip,
      connectedAt: client.connectedAt
    }));
  }

  registerTool(connectionType, toolName, toolDefinition) {
    /**
     * Registers a tool for a specific connection type.
     * 
     * @param {string} connectionType - The connection type.
     * @param {string} toolName - The tool name.
     * @param {Object} toolDefinition - The tool definition including handler.
     * @returns {void}
     */
    this.tools.registerTool(connectionType, toolName, toolDefinition);
  }

  getToolsForConnection(connectionType) {
    /**
     * Gets tools available for a specific connection type.
     * 
     * @param {string} connectionType - The connection type.
     * @returns {Array} Array of tool definitions.
     */
    return this.tools.getToolsListForConnection(connectionType);
  }
}

module.exports = { MCPServer };
