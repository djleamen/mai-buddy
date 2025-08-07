const Store = require('electron-store');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const axios = require('axios');

class MCPManager {
  constructor() {
    this.store = new Store();
    this.connections = new Map();
    this.availableConnections = this.getAvailableMCPConnections();
  }

  async initialize() {
    const savedConnections = this.store.get('mcpConnections', []);
    
    for (const connectionData of savedConnections) {
      try {
        await this.addConnection(connectionData, false);
      } catch (error) {
        console.error(`Failed to restore connection ${connectionData.name}:`, error);
      }
    }
  }

  getAvailableMCPConnections() {
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
      {
        id: 'asana',
        name: 'Asana',
        description: 'Asana project and task management',
        category: 'Productivity',
        type: 'api',
        endpoint: 'https://app.asana.com/api/1.0',
        requiresAuth: true,
        authType: 'token',
        capabilities: ['project-management', 'task-tracking', 'team-collaboration']
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
      {
        id: 'digitalocean',
        name: 'DigitalOcean',
        description: 'DigitalOcean cloud infrastructure',
        category: 'Cloud',
        type: 'api',
        endpoint: 'https://api.digitalocean.com/v2',
        requiresAuth: true,
        authType: 'token',
        capabilities: ['droplet-management', 'spaces-storage', 'kubernetes']
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
        id: 'plaid',
        name: 'Plaid',
        description: 'Plaid financial data API',
        category: 'Finance',
        type: 'api',
        endpoint: 'https://api.plaid.com',
        requiresAuth: true,
        authType: 'token',
        capabilities: ['bank-account-access', 'transaction-data', 'financial-insights']
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
        capabilities: ['video-upload', 'analytics', 'channel-management']
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
    // Database connections would require specific database drivers
    // This is a placeholder implementation
    connection.status = 'connected';
    connection.lastConnected = new Date().toISOString();
  }

  async connectToLocal(connection) {
    // Local connections are always available
    connection.status = 'connected';
    connection.lastConnected = new Date().toISOString();
  }

  async removeConnection(connectionId) {
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
    if (connection.client) {
      if (connection.type === 'websocket') {
        connection.client.close();
      }
      connection.client = null;
    }
    
    connection.status = 'disconnected';
  }

  async testConnection(connectionId) {
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
    return this.availableConnections;
  }

  saveConnections() {
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
}

module.exports = { MCPManager };
