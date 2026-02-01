/**
 * MCP Manager Service
 * Handles connections to various MCP (Modular Connection Protocol) services.
 * Manages available connections, establishes and tests connections,
 * 
 * Author: DJ Leamen, 2025-2026
 */

const Store = require('electron-store');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const axios = require('axios');
const { MCPTools } = require('./mcp-tools');
const { MCPServer } = require('./mcp-server');

/**
 * MCPManager class to handle MCP connections and tools.
 * Manages connection lifecycle, tool execution, and MCP server operations.
 */
class MCPManager {
  constructor() {
    /**
     * Creates an MCPManager instance.
     * Initializes storage, connections map, tools registry, and local server.
     */
    this.store = new Store();
    this.connections = new Map();
    this.availableConnections = this.getAvailableMCPConnections();
    this.tools = new MCPTools();
    this.localServer = null;
    this.isLocalServerRunning = false;
  }

  async initialize() {
    /**
     * Initializes the MCPManager service.
     * Starts the local MCP server, restores saved connections, and adds default local connections.
     * 
     * @async
     * @returns {Promise<void>}
     */
    await this.startLocalServer();
    
    const savedConnections = this.store.get('mcpConnections', []);
    
    for (const connectionData of savedConnections) {
      try {
        await this.addConnection(connectionData, false);
      } catch (error) {
        console.error(`Failed to restore connection ${connectionData.name}:`, error);
      }
    }

    await this.addDefaultLocalConnections();
  }

  getAvailableMCPConnections() {
    /**
     * Returns a list of available MCP connection types.
     * 
     * @returns {Array} List of available MCP connections.
     */
    return [
      // Development & Code
      {
        id: 'github',
        name: 'GitHub',
        description: 'Access GitHub repositories, issues, and pull requests',
        category: 'Development',
        type: 'api',
        endpoint: 'https://api.github.com',
        requiresAuth: true,
        authType: 'token',
        capabilities: ['repository-access', 'issue-management', 'code-search']
      },
      {
        id: 'gitlab',
        name: 'GitLab',
        description: 'GitLab project management and code hosting',
        category: 'Development',
        type: 'api',
        endpoint: 'https://gitlab.com/api/v4',
        requiresAuth: true,
        authType: 'token',
        capabilities: ['repository-access', 'ci-cd', 'issue-tracking']
      },
      {
        id: 'vscode',
        name: 'VS Code',
        description: 'VS Code editor integration',
        category: 'Development',
        type: 'local',
        endpoint: 'ws://localhost:3000',
        requiresAuth: false,
        capabilities: ['file-editing', 'project-navigation', 'debugging']
      },
      {
        id: 'docker',
        name: 'Docker',
        description: 'Docker container management',
        category: 'Development',
        type: 'local',
        endpoint: 'unix:///var/run/docker.sock',
        requiresAuth: false,
        capabilities: ['container-management', 'image-building', 'network-management']
      },

      // Productivity & Communication
      {
        id: 'slack',
        name: 'Slack',
        description: 'Slack team communication',
        category: 'Communication',
        type: 'api',
        endpoint: 'https://slack.com/api',
        requiresAuth: true,
        authType: 'oauth',
        capabilities: ['messaging', 'channel-management', 'file-sharing']
      },
      {
        id: 'discord',
        name: 'Discord',
        description: 'Discord server and messaging',
        category: 'Communication',
        type: 'api',
        endpoint: 'https://discord.com/api/v10',
        requiresAuth: true,
        authType: 'token',
        capabilities: ['messaging', 'server-management', 'voice-channels']
      },
      {
        id: 'teams',
        name: 'Microsoft Teams',
        description: 'Microsoft Teams collaboration',
        category: 'Communication',
        type: 'api',
        endpoint: 'https://graph.microsoft.com/v1.0',
        requiresAuth: true,
        authType: 'oauth',
        capabilities: ['messaging', 'meetings', 'file-collaboration']
      },
      {
        id: 'notion',
        name: 'Notion',
        description: 'Notion workspace and database management',
        category: 'Productivity',
        type: 'api',
        endpoint: 'https://api.notion.com/v1',
        requiresAuth: true,
        authType: 'token',
        capabilities: ['database-access', 'page-creation', 'content-management']
      },
      {
        id: 'trello',
        name: 'Trello',
        description: 'Trello board and card management',
        category: 'Productivity',
        type: 'api',
        endpoint: 'https://api.trello.com/1',
        requiresAuth: true,
        authType: 'token',
        capabilities: ['board-management', 'card-creation', 'workflow-automation']
      },

      // Cloud Services
      {
        id: 'aws',
        name: 'Amazon Web Services',
        description: 'AWS cloud services integration',
        category: 'Cloud',
        type: 'api',
        endpoint: 'https://aws.amazon.com',
        requiresAuth: true,
        authType: 'iam',
        capabilities: ['ec2-management', 's3-storage', 'lambda-functions']
      },
      {
        id: 'gcp',
        name: 'Google Cloud Platform',
        description: 'Google Cloud services',
        category: 'Cloud',
        type: 'api',
        endpoint: 'https://cloud.google.com',
        requiresAuth: true,
        authType: 'service-account',
        capabilities: ['compute-engine', 'cloud-storage', 'ai-services']
      },
      {
        id: 'azure',
        name: 'Microsoft Azure',
        description: 'Microsoft Azure cloud platform',
        category: 'Cloud',
        type: 'api',
        endpoint: 'https://management.azure.com',
        requiresAuth: true,
        authType: 'service-principal',
        capabilities: ['virtual-machines', 'storage-accounts', 'cognitive-services']
      },

      // Databases
      {
        id: 'postgresql',
        name: 'PostgreSQL',
        description: 'PostgreSQL database connection',
        category: 'Database',
        type: 'database',
        endpoint: 'postgresql://localhost:5432',
        requiresAuth: true,
        authType: 'credentials',
        capabilities: ['query-execution', 'schema-management', 'data-analysis']
      },
      {
        id: 'mysql',
        name: 'MySQL',
        description: 'MySQL database connection',
        category: 'Database',
        type: 'database',
        endpoint: 'mysql://localhost:3306',
        requiresAuth: true,
        authType: 'credentials',
        capabilities: ['query-execution', 'table-management', 'data-import']
      },
      {
        id: 'mongodb',
        name: 'MongoDB',
        description: 'MongoDB document database',
        category: 'Database',
        type: 'database',
        endpoint: 'mongodb://localhost:27017',
        requiresAuth: true,
        authType: 'credentials',
        capabilities: ['document-operations', 'collection-management', 'aggregation']
      },
      {
        id: 'redis',
        name: 'Redis',
        description: 'Redis in-memory data store',
        category: 'Database',
        type: 'database',
        endpoint: 'redis://localhost:6379',
        requiresAuth: false,
        capabilities: ['key-value-operations', 'pub-sub', 'caching']
      },

      // AI & ML Services
      {
        id: 'huggingface',
        name: 'Hugging Face',
        description: 'Hugging Face model hub and inference',
        category: 'AI/ML',
        type: 'api',
        endpoint: 'https://api-inference.huggingface.co',
        requiresAuth: true,
        authType: 'token',
        capabilities: ['model-inference', 'dataset-access', 'model-training']
      },
      {
        id: 'anthropic',
        name: 'Anthropic Claude',
        description: 'Anthropic Claude AI assistant',
        category: 'AI/ML',
        type: 'api',
        endpoint: 'https://api.anthropic.com',
        requiresAuth: true,
        authType: 'token',
        capabilities: ['text-generation', 'conversation', 'analysis']
      },
      {
        id: 'replicate',
        name: 'Replicate',
        description: 'Replicate AI model hosting',
        category: 'AI/ML',
        type: 'api',
        endpoint: 'https://api.replicate.com/v1',
        requiresAuth: true,
        authType: 'token',
        capabilities: ['model-inference', 'image-generation', 'video-processing']
      },
      {
        id: 'ollama',
        name: 'Ollama',
        description: 'Ollama AI model hosting',
        category: 'AI/ML',
        type: 'api',
        endpoint: 'https://api.ollama.com/v1',
        requiresAuth: true,
        authType: 'token',
        capabilities: ['model-inference', 'image-generation', 'video-processing']
      },
      {
        id: 'openai',
        name: 'OpenAI',
        description: 'OpenAI API for language models',
        category: 'AI/ML',
        type: 'api',
        endpoint: 'https://api.openai.com/v1',
        requiresAuth: true,
        authType: 'token',
        capabilities: ['model-inference', 'text-generation', 'conversation']
      },

      // Finance & Business
      {
        id: 'stripe',
        name: 'Stripe',
        description: 'Stripe payment processing',
        category: 'Finance',
        type: 'api',
        endpoint: 'https://api.stripe.com',
        requiresAuth: true,
        authType: 'token',
        capabilities: ['payment-processing', 'subscription-management', 'financial-reporting']
      },
      {
        id: 'salesforce',
        name: 'Salesforce',
        description: 'Salesforce CRM integration',
        category: 'Business',
        type: 'api',
        endpoint: 'https://api.salesforce.com',
        requiresAuth: true,
        authType: 'oauth',
        capabilities: ['crm-management', 'lead-tracking', 'sales-automation']
      },
      {
        id: 'shopify',
        name: 'Shopify',
        description: 'Shopify e-commerce platform',
        category: 'Business',
        type: 'api',
        endpoint: 'https://api.shopify.com/v1',
        requiresAuth: true,
        authType: 'oauth',
        capabilities: ['product-management', 'order-processing', 'customer-management']
      },

      // Content & Media
      {
        id: 'youtube',
        name: 'YouTube',
        description: 'YouTube video and channel management',
        category: 'Media',
        type: 'api',
        endpoint: 'https://www.googleapis.com/youtube/v3',
        requiresAuth: true,
        authType: 'oauth',
      },
      {
        id: 'spotify',
        name: 'Spotify',
        description: 'Spotify music streaming integration',
        category: 'Media',
        type: 'api',
        endpoint: 'https://api.spotify.com/v1',
        requiresAuth: true,
        authType: 'oauth',
        capabilities: ['playlist-management', 'music-search', 'playback-control']
      },
      {
        id: 'unsplash',
        name: 'Unsplash',
        description: 'Unsplash stock photo API',
        category: 'Media',
        type: 'api',
        endpoint: 'https://api.unsplash.com',
        requiresAuth: true,
        authType: 'token',
        capabilities: ['photo-search', 'image-download', 'collection-access']
      },

      // System Integration
      {
        id: 'filesystem',
        name: 'File System',
        description: 'Local file system access',
        category: 'System',
        type: 'local',
        endpoint: 'file:///',
        requiresAuth: false,
        capabilities: ['file-operations', 'directory-management', 'file-search']
      },
      {
        id: 'terminal',
        name: 'Terminal',
        description: 'System terminal and command execution',
        category: 'System',
        type: 'local',
        endpoint: 'local://terminal',
        requiresAuth: false,
        capabilities: ['command-execution', 'script-running', 'system-monitoring']
      },
      {
        id: 'calendar',
        name: 'System Calendar',
        description: 'System calendar integration',
        category: 'System',
        type: 'local',
        endpoint: 'local://calendar',
        requiresAuth: false,
        capabilities: ['event-management', 'scheduling', 'reminder-setting']
      },

      // Custom MCP Servers
      {
        id: 'custom-mcp',
        name: 'Custom MCP Server',
        description: 'Connect to custom MCP implementation',
        category: 'Custom',
        type: 'websocket',
        endpoint: 'ws://localhost:3001',
        requiresAuth: false,
        capabilities: ['custom-tools', 'specialized-functions']
      }
    ];
  }

  async addConnection(connectionData, save = true) {
    /**
     * Adds a new MCP connection to the manager.
     * 
     * @async
     * @param {Object} connectionData - The connection details including id, name, type, endpoint.
     * @param {boolean} [save=true] - Whether to persist the connection to storage.
     * @returns {Promise<Object>} The created connection object.
     * @throws {Error} If connection establishment fails.
     */
    const connection = {
      id: connectionData.id || uuidv4(),
      ...connectionData,
      status: 'disconnected',
      lastConnected: null,
      client: null
    };

    try {
      await this.establishConnection(connection);
      this.connections.set(connection.id, connection);
      
      if (save) {
        this.saveConnections();
      }
      
      return connection;
    } catch (error) {
      console.error(`Failed to establish connection to ${connection.name}:`, error);
      throw error;
    }
  }

  async establishConnection(connection) {
    /**
     * Establishes a connection based on its type (api, websocket, database, or local).
     * 
     * @async
     * @param {Object} connection - The connection object with type property.
     * @returns {Promise<void>}
     * @throws {Error} If connection type is unsupported.
     */
    switch (connection.type) {
    case 'api':
      await this.connectToAPI(connection);
      break;
    case 'websocket':
      await this.connectToWebSocket(connection);
      break;
    case 'database':
      await this.connectToDatabase(connection);
      break;
    case 'local':
      await this.connectToLocal(connection);
      break;
    default:
      throw new Error(`Unsupported connection type: ${connection.type}`);
    }
  }

  async connectToAPI(connection) {
    /**
     * Connects to a RESTful API endpoint.
     * Handles token and OAuth authentication.
     * 
     * @async
     * @param {Object} connection - The connection object with endpoint and auth details.
     * @returns {Promise<void>}
     * @throws {Error} If API connection fails.
     */
    try {
      const headers = {};
      
      if (connection.requiresAuth) {
        switch (connection.authType) {
        case 'token':
          headers['Authorization'] = `Bearer ${connection.apiKey}`;
          break;
        case 'oauth':
          headers['Authorization'] = `Bearer ${connection.accessToken}`;
          break;
        }
      }

      const response = await axios.get(connection.endpoint, { headers, timeout: 5000 });
      
      if (response.status === 200) {
        connection.status = 'connected';
        connection.lastConnected = new Date().toISOString();
      }
    } catch (error) {
      connection.status = 'error';
      throw new Error(`API connection failed: ${error.message}`);
    }
  }

  async connectToWebSocket(connection) {
    /**
     * Connects to a WebSocket endpoint with automatic reconnection handling.
     * Times out after 5 seconds if connection not established.
     * 
     * @async
     * @param {Object} connection - The connection object with WebSocket endpoint.
     * @returns {Promise<void>}
     * @throws {Error} If WebSocket connection fails or times out.
     */
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(connection.endpoint);
        
        ws.on('open', () => {
          connection.status = 'connected';
          connection.lastConnected = new Date().toISOString();
          connection.client = ws;
          resolve();
        });

        ws.on('error', (error) => {
          connection.status = 'error';
          reject(new Error(`WebSocket connection failed: ${error.message}`));
        });

        ws.on('close', () => {
          connection.status = 'disconnected';
          connection.client = null;
        });

        // Timeout after 5 seconds
        setTimeout(() => {
          if (connection.status !== 'connected') {
            ws.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 5000);

      } catch (error) {
        reject(error);
      }
    });
  }

  async connectToDatabase(connection) {
    /**
     * Connects to a database endpoint.
     * Note: This is a placeholder implementation requiring specific database drivers.
     * 
     * @async
     * @param {Object} connection - The connection object with database credentials.
     * @returns {Promise<void>}
     */
    // Database connections would require specific database drivers
    // This is a placeholder implementation
    connection.status = 'connected';
    connection.lastConnected = new Date().toISOString();
  }

  async connectToLocal(connection) {
    /**
     * Connects to a local endpoint (filesystem, terminal, etc.).
     * 
     * @async
     * @param {Object} connection - The connection object with local endpoint.
     * @returns {Promise<void>}
     */
    connection.status = 'connected';
    connection.lastConnected = new Date().toISOString();
  }

  async removeConnection(connectionId) {
    /**
     * Removes a connection from the manager.
     * 
     * @async
     * @param {string} connectionId - The ID of the connection to remove.
     * @returns {Promise<boolean>} True if removed successfully, false if not found.
     */
    const connection = this.connections.get(connectionId);
    
    if (connection) {
      await this.disconnectConnection(connection);
      this.connections.delete(connectionId);
      this.saveConnections();
      return true;
    }
    
    return false;
  }

  async disconnectConnection(connection) {
    /**
     * Disconnects an active connection and cleans up resources.
     * 
     * @async
     * @param {Object} connection - The connection object to disconnect.
     * @returns {Promise<void>}
     */
    if (connection.client) {
      if (connection.type === 'websocket') {
        connection.client.close();
      }
      connection.client = null;
    }
    
    connection.status = 'disconnected';
  }

  async testConnection(connectionId) {
    /**
     * Tests the specified connection by attempting to establish it.
     * 
     * @async
     * @param {string} connectionId - The ID of the connection to test.
     * @returns {Promise<Object>} Result object with success status and message.
     * @throws {Error} If connection not found.
     */
    const connection = this.connections.get(connectionId);
    
    if (!connection) {
      throw new Error('Connection not found');
    }

    try {
      await this.establishConnection(connection);
      return { success: true, message: 'Connection successful' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  getConnections() {
    /**
     * Returns a list of all MCP connections with their details.
     * 
     * @returns {Array} List of MCP connections.
     */
    return Array.from(this.connections.values()).map(conn => ({
      id: conn.id,
      name: conn.name,
      description: conn.description,
      category: conn.category,
      status: conn.status,
      lastConnected: conn.lastConnected,
      capabilities: conn.capabilities
    }));
  }

  getAvailableConnectionTypes() {
    /**
     * Returns a list of available MCP connection types.
     * 
     * @returns {Array} List of available MCP connections.
     */
    return this.availableConnections;
  }

  saveConnections() {
    /**
     * Saves all connections to persistent storage.
     * Strips out client objects and runtime-only properties.
     * 
     * @returns {void}
     */
    const connectionsData = Array.from(this.connections.values()).map(conn => ({
      id: conn.id,
      name: conn.name,
      description: conn.description,
      category: conn.category,
      type: conn.type,
      endpoint: conn.endpoint,
      requiresAuth: conn.requiresAuth,
      authType: conn.authType,
      apiKey: conn.apiKey,
      accessToken: conn.accessToken,
      capabilities: conn.capabilities
    }));
    
    this.store.set('mcpConnections', connectionsData);
  }

  async sendMCPMessage(connectionId, message, method = 'tools/call') {
    /**
     * Sends an MCP message over the specified connection.
     * Supports WebSocket connections with JSON-RPC 2.0 protocol.
     * 
     * @async
     * @param {string} connectionId - The ID of the connection to use.
     * @param {Object} message - The message payload.
     * @param {string} [method='tools/call'] - The MCP method to invoke.
     * @returns {Promise<Object>} The response from the MCP service.
     * @throws {Error} If connection not available or unsupported type.
     */
    const connection = this.connections.get(connectionId);
    
    if (!connection || connection.status !== 'connected') {
      throw new Error('Connection not available');
    }

    if (connection.type === 'websocket' && connection.client) {
      return new Promise((resolve, reject) => {
        const messageId = uuidv4();
        const mcpMessage = {
          jsonrpc: '2.0',
          id: messageId,
          method,
          params: message
        };

        connection.client.send(JSON.stringify(mcpMessage));

        const timeout = setTimeout(() => {
          reject(new Error('MCP message timeout'));
        }, 10000);

        connection.client.once('message', (data) => {
          clearTimeout(timeout);
          try {
            const response = JSON.parse(data);
            if (response.id === messageId) {
              resolve(response.result);
            }
          } catch (error) {
            reject(error);
          }
        });
      });
    }

    throw new Error('Unsupported connection type for MCP messaging');
  }

  async startLocalServer() {
    /**
     * Starts the local MCP server on port 3001.
     * 
     * @async
     * @returns {Promise<void>}
     */
    if (!this.isLocalServerRunning && !this.localServer) {
      try {
        this.localServer = new MCPServer(3001);
        await this.localServer.start();
        this.isLocalServerRunning = true;
        console.log('✅ Local MCP server started successfully');
      } catch (error) {
        console.error('Failed to start local MCP server:', error);
        this.localServer = null;
        this.isLocalServerRunning = false;
      }
    }
  }

  async stopLocalServer() {
    /**
     * Stops the local MCP server and cleans up resources.
     * 
     * @async
     * @returns {Promise<void>}
     */
    if (this.localServer && this.isLocalServerRunning) {
      this.localServer.stop();
      this.isLocalServerRunning = false;
      this.localServer = null;
      console.log('🛑 Local MCP server stopped');
    }
  }

  async addDefaultLocalConnections() {
    /**
     * Adds default local connections for file system and terminal.
     * Only adds connections that don't already exist.
     * 
     * @async
     * @returns {Promise<void>}
     */
    const defaultConnections = [
      {
        id: 'local-filesystem',
        name: 'Local File System',
        description: 'Access local file system operations',
        category: 'System',
        type: 'local',
        endpoint: 'local://filesystem',
        requiresAuth: false,
        capabilities: ['file-operations', 'directory-management', 'file-search']
      },
      {
        id: 'local-terminal',
        name: 'Local Terminal',
        description: 'Execute terminal commands',
        category: 'System',
        type: 'local',
        endpoint: 'local://terminal',
        requiresAuth: false,
        capabilities: ['command-execution', 'script-running', 'system-monitoring']
      }
    ];

    // Add default local connections if they don't exist
    for (const connectionData of defaultConnections) {
      if (!this.connections.has(connectionData.id)) {
        try {
          await this.addConnection(connectionData, false);
          console.log(`✅ Added default connection: ${connectionData.name}`);
        } catch (error) {
          console.error(`Failed to add default connection ${connectionData.name}:`, error);
        }
      }
    }
  }

  async executeTool(connectionId, toolName, parameters) {
    /**
     * Executes a tool over a specific connection.
     * Handles different connection types (local, api, websocket) appropriately.
     * 
     * @async
     * @param {string} connectionId - The ID of the connection to use.
     * @param {string} toolName - The name of the tool to execute.
     * @param {Object} parameters - The parameters to pass to the tool.
     * @returns {Promise<any>} The result of the tool execution.
     * @throws {Error} If connection not available or tool execution unsupported.
     */
    const connection = this.connections.get(connectionId);
    
    if (!connection || connection.status !== 'connected') {
      throw new Error('Connection not available');
    }

    // For local connections, use the tools directly
    if (connection.type === 'local') {
      const connectionType = this.getConnectionTypeFromEndpoint(connection.endpoint);
      return await this.tools.executeTool(connectionType, toolName, parameters);
    }

    // For API connections, use the tools directly with connection ID
    if (connection.type === 'api') {
      return await this.tools.executeTool(connectionId, toolName, parameters);
    }

    // For other connections, send MCP message
    if (connection.type === 'websocket') {
      return await this.sendMCPMessage(connectionId, {
        connection_type: connection.category.toLowerCase(),
        tool_name: toolName,
        arguments: parameters
      }, 'tools/call');
    }

    throw new Error('Tool execution not supported for this connection type');
  }

  /* Configuration methods for GitHub */

  setGitHubToken(token) {
    /**
     * Sets the GitHub API token and updates the GitHub connection.
     * 
     * @param {string} token - The GitHub API token.
     * @returns {void}
     */
    this.tools.setGitHubToken(token);
    
    const githubConnection = Array.from(this.connections.values())
      .find(conn => conn.id === 'github');
    
    if (githubConnection) {
      githubConnection.apiKey = token;
      this.saveConnections();
    }
  }

  async connectGitHub(token) {
    /**
     * Connects to GitHub with the provided token.
     * Validates the token by authenticating with GitHub API.
     * 
     * @async
     * @param {string} token - The GitHub API token.
     * @returns {Promise<Object>} Result object with success status and message.
     */
    try {
      this.setGitHubToken(token);
      
      const { Octokit } = require('@octokit/rest');
      const client = new Octokit({ auth: token });
      await client.rest.users.getAuthenticated();
      
      const githubConnectionData = {
        id: 'github',
        name: 'GitHub',
        description: 'GitHub API integration',
        category: 'Development',
        type: 'api',
        endpoint: 'https://api.github.com',
        requiresAuth: true,
        authType: 'token',
        apiKey: token,
        capabilities: ['repository-access', 'issue-management', 'code-search']
      };
      
      await this.addConnection(githubConnectionData);
      return { success: true, message: 'GitHub connected successfully' };
      
    } catch (error) {
      return { success: false, error: `GitHub connection failed: ${error.message}` };
    }
  }

  getConnectionInfo() {
    /**
     * Gets connection status and information for all connections.
     * 
     * @returns {Array<Object>} Array of connection information objects.
     */
    const connections = [];
    
    for (const connection of this.connections.values()) {
      connections.push({
        id: connection.id,
        name: connection.name,
        category: connection.category,
        type: connection.type,
        status: connection.status,
        lastConnected: connection.lastConnected,
        capabilities: connection.capabilities,
        requiresAuth: connection.requiresAuth,
        authType: connection.authType
      });
    }
    
    return connections;
  }

  getConnectionTypeFromEndpoint(endpoint) {
    /**
     * Determines connection type from endpoint URL.
     * 
     * @param {string} endpoint - The endpoint URL.
     * @returns {string} The connection type (filesystem, terminal, calendar, or default filesystem).
     */
    if (endpoint.includes('filesystem')) return 'filesystem';
    if (endpoint.includes('terminal')) return 'terminal';
    if (endpoint.includes('calendar')) return 'calendar';
    return 'filesystem';
  }

  async getAvailableTools(connectionId) {
    /**
     * Gets available tools for a specific connection.
     * Queries the connection or local tools registry based on connection type.
     * 
     * @async
     * @param {string} connectionId - The ID of the connection.
     * @returns {Promise<Array>} Array of available tool definitions.
     * @throws {Error} If connection not found.
     */
    const connection = this.connections.get(connectionId);
    
    if (!connection) {
      throw new Error('Connection not found');
    }

    if (connection.type === 'local') {
      const connectionType = this.getConnectionTypeFromEndpoint(connection.endpoint);
      return this.tools.getToolsListForConnection(connectionType);
    }

    if (connection.type === 'websocket' && connection.status === 'connected') {
      try {
        const result = await this.sendMCPMessage(connectionId, {
          connection_type: connection.category.toLowerCase()
        }, 'tools/list');
        return result.tools || [];
      } catch (error) {
        console.error(`Failed to get tools for ${connectionId}:`, error);
        return [];
      }
    }

    return [];
  }

  async testConnectionWithPing(connectionId) {
    /**
     * Tests connection with a ping message for WebSocket connections.
     * Falls back to regular connection test for other types.
     * 
     * @async
     * @param {string} connectionId - The ID of the connection to test.
     * @returns {Promise<Object>} Result object with success status.
     * @throws {Error} If connection not found.
     */
    const connection = this.connections.get(connectionId);
    
    if (!connection) {
      throw new Error('Connection not found');
    }

    if (connection.type === 'websocket' && connection.status === 'connected') {
      try {
        const result = await this.sendMCPMessage(connectionId, {}, 'ping');
        return { success: true, ...result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    return await this.testConnection(connectionId);
  }

  getConnectionStats() {
    /**
     * Gets statistics about current connections.
     * Includes counts by status, type, and category.
     * 
     * @returns {Object} Statistics object with connection metrics.
     */
    const stats = {
      total: this.connections.size,
      connected: 0,
      disconnected: 0,
      error: 0,
      byType: {},
      byCategory: {}
    };

    for (const connection of this.connections.values()) {
      stats[connection.status] = (stats[connection.status] || 0) + 1;
      
      stats.byType[connection.type] = (stats.byType[connection.type] || 0) + 1;
      
      stats.byCategory[connection.category] = (stats.byCategory[connection.category] || 0) + 1;
    }

    stats.localServerRunning = this.isLocalServerRunning;
    return stats;
  }

  async reconnectAll() {
    /**
     * Reconnects all disconnected connections.
     * 
     * @async
     * @returns {Promise<Array>} Array of results for each reconnection attempt.
     */
    const results = [];
    
    for (const [connectionId, connection] of this.connections) {
      if (connection.status !== 'connected') {
        try {
          await this.establishConnection(connection);
          results.push({ connectionId, success: true });
        } catch (error) {
          results.push({ connectionId, success: false, error: error.message });
        }
      }
    }
    
    return results;
  }

  async cleanup() {
    /**
     * Cleans up all connections and stops the local server.
     * Should be called on application shutdown.
     * 
     * @async
     * @returns {Promise<void>}
     */
    for (const connection of this.connections.values()) {
      await this.disconnectConnection(connection);
    }
    
    await this.stopLocalServer();
    
    console.log('🧹 MCP Manager cleanup completed');
  }
}

module.exports = { MCPManager };
