/*
This file contains the AIService class, which handles communication with the OpenAI API 
and manages conversation history. Note that this file assumes macOS file paths.
*/

const OpenAI = require('openai');
const Store = require('electron-store');
const { PromptManager } = require('./prompts/prompt-manager');
require('dotenv').config();

class AIService {
  constructor() {
    this.store = new Store();
    this.openai = null;
    this.conversationHistory = [];
    this.userHomePath = process.env.USER_HOME_PATH || require('os').homedir();
    this.promptManager = new PromptManager();
    this.systemPrompt = this.promptManager.constructPrompt({
      includeTech: false,
      includeUserContext: false
    });
  }

  async initialize() {
    const settings = this.store.get('settings', {});
    
    if (settings.openaiApiKey) {
      this.openai = new OpenAI({
        apiKey: settings.openaiApiKey
      });
    }

    // Load conversation history
    this.conversationHistory = this.store.get('conversationHistory', []);
  }

  async processMessage(message, options = {}) {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured. Please set it in settings.');
    }

    try {
      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      });

      // Analyze message to determine needed context
      const needsTechContext = message.toLowerCase().includes('code') || 
                             message.toLowerCase().includes('program') ||
                             message.toLowerCase().includes('develop') ||
                             message.toLowerCase().includes('bug') ||
                             message.toLowerCase().includes('error');
                             
      const needsUserContext = message.toLowerCase().includes('you') ||
                              message.toLowerCase().includes('your') ||
                              message.toLowerCase().includes('remember') ||
                              message.toLowerCase().includes('earlier') ||
                              message.toLowerCase().includes('before');

      // Update system prompt based on context
      this.systemPrompt = this.promptManager.constructPrompt({
        includeTech: needsTechContext,
        includeUserContext: needsUserContext
      });

      // Prepare messages for API call
      const messages = [
        { role: 'system', content: this.systemPrompt },
        ...this.conversationHistory.slice(-10).map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ];

      const completion = await this.openai.chat.completions.create({
        model: options.model || 'gpt-4-turbo',
        messages: messages,
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
        stream: false
      });

      const response = completion.choices[0].message.content;

      // Add assistant response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString()
      });

      // Save conversation history
      this.saveConversationHistory();

      return {
        response,
        usage: completion.usage,
        model: completion.model
      };

    } catch (error) {
      console.error('Error processing message:', error);
      throw error;
    }
  }

  async processWithMCP(message, mcpManager = null) {
    if (!mcpManager) {
      // Fall back to regular processing if no MCP manager
      return await this.processMessage(message);
    }

    // Get available MCP connections
    const connections = mcpManager.getConnections();
    const activeConnections = connections.filter(conn => conn.status === 'connected');

    if (activeConnections.length === 0) {
      // No active MCP connections, process normally
      return await this.processMessage(message);
    }

    // Enhanced processing with MCP tool integration
    const mcpContext = activeConnections.map(conn => ({
      name: conn.name,
      description: conn.description,
      capabilities: conn.capabilities,
      category: conn.category
    }));

    // Get available tools for each connection
    const availableTools = {};
    for (const conn of activeConnections) {
      try {
        const tools = await mcpManager.getAvailableTools(conn.id);
        if (tools.length > 0) {
          availableTools[conn.name] = tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            connectionId: conn.id
          }));
        }
      } catch (error) {
        console.error(`Failed to get tools for ${conn.name}:`, error);
      }
    }

    // Check if the user message requires tool execution
    const toolRequest = this.analyzeToolRequest(message, availableTools);
    
    if (toolRequest) {
      try {
        console.log(`🔧 Executing tool: ${toolRequest.toolName} on ${toolRequest.connectionName}`);
        const toolResult = await mcpManager.executeTool(
          toolRequest.connectionId, 
          toolRequest.toolName, 
          toolRequest.parameters
        );

        // Create an enhanced prompt with the actual tool result
        const enhancedPrompt = `${this.systemPrompt}

I just executed the following tool for you:
Tool: ${toolRequest.toolName}
Connection: ${toolRequest.connectionName}
Parameters: ${JSON.stringify(toolRequest.parameters)}

Tool Result:
${JSON.stringify(toolResult, null, 2)}

Please provide a helpful response based on this result. Present the information in a user-friendly way.

Original user request: ${message}`;

        const response = await this.processMessage(enhancedPrompt);
        return {
          ...response,
          toolExecuted: true,
          toolResult: toolResult
        };

      } catch (error) {
        console.error('Tool execution failed:', error);
        
        // Fall back to explaining what went wrong
        const errorPrompt = `${this.systemPrompt}

I attempted to execute a tool for the user's request but encountered an error:
Error: ${error.message}

User request: ${message}

Please acknowledge the error and suggest alternatives or troubleshooting steps.`;

        const response = await this.processMessage(errorPrompt);
        return {
          ...response,
          toolExecuted: false,
          toolError: error.message
        };
      }
    }

    // No specific tool request detected, provide context about available tools
    const enhancedPrompt = `${this.systemPrompt}

AVAILABLE MCP CONNECTIONS AND TOOLS:
${mcpContext.map(mcp => {
    const tools = availableTools[mcp.name] || [];
    const toolsList = tools.length > 0 
      ? tools.map(t => `  - ${t.name}: ${t.description}`).join('\n')
      : '  No tools available';
  
    return `${mcp.name} (${mcp.category}): ${mcp.description}
${toolsList}`;
  }).join('\n\n')}

When responding, you can mention that you have access to these tools and services through your MCP integrations. If the user asks you to perform actions that these tools can handle, let them know you can help with that.

User message: ${message}`;

    try {
      const response = await this.processMessage(enhancedPrompt);
      
      // Check if the response mentions any tool usage and log it
      const mentionedTools = this.detectToolMentions(response.response, availableTools);
      if (mentionedTools.length > 0) {
        console.log('🔧 AI mentioned tools:', mentionedTools);
      }

      return response;
    } catch (error) {
      console.error('Error in MCP-enhanced processing:', error);
      // Fall back to regular processing
      return await this.processMessage(message);
    }
  }

  analyzeToolRequest(message, availableTools) {
    const lowerMessage = message.toLowerCase();
    
    // Command execution patterns
    if (lowerMessage.includes('run ') || lowerMessage.includes('execute ') || 
        lowerMessage.includes('command ') || lowerMessage.includes('./') ||
        lowerMessage.includes('.sh') || lowerMessage.includes('/')) {
      
      // Extract command from message
      let command = '';
      
      // Look for absolute path scripts (starting with /)
      const absolutePathMatch = message.match(/[/][\w.-/]+\.sh/);
      if (absolutePathMatch) {
        command = absolutePathMatch[0];
      }
      
      // Look for scripts starting with ./
      const scriptMatch = message.match(/\.\/[\w.-]+/);
      if (scriptMatch && !command) {
        command = scriptMatch[0];
      }
      
      // Look for specific script names and try common locations
      const scriptNameMatch = message.match(/\b([\w.-]+\.sh)\b/);
      if (scriptNameMatch && !command) {
        const scriptName = scriptNameMatch[1];
        
        // Try common locations for the script
        const commonPaths = [
          `${this.userHomePath}/${scriptName}`,  // User home directory
          `/${scriptName}`,                      // Root directory
          `./${scriptName}`,                     // Current directory
          `/usr/local/bin/${scriptName}`,        // Local bin
          `/opt/homebrew/bin/${scriptName}`      // Homebrew bin
        ];
        
        // For now, assume it's in the user's home directory if it's a common script like brew.sh
        if (scriptName === 'brew.sh') {
          command = `${this.userHomePath}/${scriptName}`;
        } else if (lowerMessage.includes('root')) {
          command = `/${scriptName}`;
        } else {
          command = `${this.userHomePath}/${scriptName}`; // Default to user home
        }
      }
      
      // Look for quoted commands
      const quotedMatch = message.match(/['"`]([^'"`]+)['"`]/);
      if (quotedMatch && !command) {
        command = quotedMatch[1];
      }
      
      // Look for commands after "run" or "execute"
      const runMatch = message.match(/(?:run|execute)\s+(.+?)(?:\s|$)/i);
      if (runMatch && !command) {
        command = runMatch[1].trim();
      }
      
      // If we found a command and have a terminal connection
      const terminalTools = availableTools['Local Terminal'];
      if (command && terminalTools) {
        const executeTool = terminalTools.find(t => t.name === 'execute_command');
        if (executeTool) {
          return {
            connectionId: executeTool.connectionId,
            connectionName: 'Local Terminal',
            toolName: 'execute_command',
            parameters: { command }
          };
        }
      }
    }
    
    // File operations - List directory
    if ((lowerMessage.includes('list ') && (lowerMessage.includes('files') || lowerMessage.includes('directory') || lowerMessage.includes('folder'))) ||
        (lowerMessage.includes('what\'s in') && (lowerMessage.includes('directory') || lowerMessage.includes('folder') || lowerMessage.includes('root'))) ||
        lowerMessage.includes('list them') ||
        lowerMessage.includes('list what') ||
        (lowerMessage.includes('list') && lowerMessage.includes(this.userHomePath.toLowerCase()))) {
      
      // Extract path if mentioned
      let path = this.userHomePath; // Default to user home
      
      // First check for explicit full paths starting with the user home path
      const userPathMatch = message.match(new RegExp(`${this.userHomePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[/\\w.-]*`, 'i'));
      if (userPathMatch) {
        path = userPathMatch[0];
        // Ensure it ends without a slash (unless it's just the home directory)
        if (path.endsWith('/') && path !== `${this.userHomePath}/`) {
          path = path.slice(0, -1);
        }
      } else if (message.toLowerCase().includes(this.userHomePath.toLowerCase().replace('/', ''))) {
        // Handle references without leading slash
        const usernamePart = this.userHomePath.split('/').pop(); // Get just the username part
        const partialPathMatch = message.match(new RegExp(`Users\\/${usernamePart}[\\/\\w.-]*`, 'i'));
        if (partialPathMatch) {
          path = '/' + partialPathMatch[0];
        } else {
          path = this.userHomePath;
        }
      } else {
        // Check for specific references
        if (lowerMessage.includes('root') && !lowerMessage.includes('project root')) {
          path = this.userHomePath; // User root directory
        } else if (lowerMessage.includes('desktop')) {
          path = `${this.userHomePath}/Desktop`;
        } else if (lowerMessage.includes('downloads')) {
          path = `${this.userHomePath}/Downloads`;
        } else if (lowerMessage.includes('documents')) {
          path = `${this.userHomePath}/Documents`;
        } else if (lowerMessage.includes('project')) {
          path = process.cwd();
        }
        
        // Look for other absolute paths
        const absolutePathMatch = message.match(/\/[\w.-\/]+/);
        if (absolutePathMatch && !absolutePathMatch[0].includes(this.userHomePath)) {
          path = absolutePathMatch[0];
        }
      }
      
      const fsTools = availableTools['Local File System'];
      if (fsTools) {
        const listTool = fsTools.find(t => t.name === 'list_directory');
        if (listTool) {
          return {
            connectionId: listTool.connectionId,
            connectionName: 'Local File System',
            toolName: 'list_directory',
            parameters: { path }
          };
        }
      }
    }
    
    // File read operations
    if ((lowerMessage.includes('read ') && lowerMessage.includes('file')) ||
        (lowerMessage.includes('what\'s in') && (lowerMessage.includes('.txt') || lowerMessage.includes('.js') || lowerMessage.includes('.json') || lowerMessage.includes('.md'))) ||
        lowerMessage.includes('show me the content')) {
      
      // Extract file path - handle both absolute and relative paths
      let path = '';
      
      // First check for explicit full paths that user provided
      const explicitPathMatch = message.match(new RegExp(`${this.userHomePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\/\\w.-]*`, 'i'));
      if (explicitPathMatch) {
        path = explicitPathMatch[0];
      }
      
      // Look for file extensions
      if (!path) {
        const fileExtMatch = message.match(/\b([\w.-]+\.(txt|js|json|md|sh|py|html|css))\b/i);
        if (fileExtMatch) {
          const fileName = fileExtMatch[1];
          // Check if it's in root context
          if (lowerMessage.includes('root') || lowerMessage.includes('my root')) {
            path = `${this.userHomePath}/${fileName}`;
          } else if (lowerMessage.includes('desktop')) {
            path = `${this.userHomePath}/Desktop/${fileName}`;
          } else {
            // Default to current directory or user home
            path = fileName.startsWith('/') ? fileName : `${this.userHomePath}/${fileName}`;
          }
        }
      }
      
      // Look for absolute paths
      if (!path) {
        const absolutePathMatch = message.match(/\/[\w.-\/]+/);
        if (absolutePathMatch) {
          path = absolutePathMatch[0];
        }
      }
      
      // Look for relative paths or file references
      if (!path) {
        const pathMatch = message.match(/(?:read|in)\s+(?:the\s+)?(?:file\s+)?([^\s]+)/i);
        if (pathMatch) {
          path = pathMatch[1];
          // If it mentions root, prepend user directory
          if (lowerMessage.includes('root') && !path.startsWith('/')) {
            path = `${this.userHomePath}/${path}`;
          }
        }
      }
      
      if (path) {
        const fsTools = availableTools['Local File System'];
        if (fsTools) {
          const readTool = fsTools.find(t => t.name === 'read_file');
          if (readTool) {
            return {
              connectionId: readTool.connectionId,
              connectionName: 'Local File System',
              toolName: 'read_file',
              parameters: { path }
            };
          }
        }
      }
    }

    // File write operations
    if ((lowerMessage.includes('write ') && lowerMessage.includes('file')) ||
        (lowerMessage.includes('create ') && lowerMessage.includes('file')) ||
        lowerMessage.includes('create it') ||
        lowerMessage.includes('make a file')) {
      
      let path = '';
      let content = '';
      
      // Look for file creation requests
      if (lowerMessage.includes('desktop') && lowerMessage.includes('mai')) {
        path = `${this.userHomePath}/Desktop/message.txt`;
        content = 'Hi, I\'m Mai';
      } else if (lowerMessage.includes('create it')) {
        // This is a follow-up to a previous request - use context
        path = `${this.userHomePath}/Desktop/message.txt`;
        content = 'Hi, I\'m Mai';
      }
      
      // Look for explicit file paths
      const fileMatch = message.match(/file\s+(?:called\s+|named\s+)?([^\s]+)/i);
      if (fileMatch && !path) {
        const fileName = fileMatch[1];
        if (lowerMessage.includes('desktop')) {
          path = `${this.userHomePath}/Desktop/${fileName}`;
        } else {
          path = fileName;
        }
      }
      
      // Look for content in quotes
      const contentMatch = message.match(/['"`]([^'"`]+)['"`]/);
      if (contentMatch && !content) {
        content = contentMatch[1];
      }
      
      if (path) {
        const fsTools = availableTools['Local File System'];
        if (fsTools) {
          const writeTool = fsTools.find(t => t.name === 'write_file');
          if (writeTool) {
            return {
              connectionId: writeTool.connectionId,
              connectionName: 'Local File System',
              toolName: 'write_file',
              parameters: { path, content: content || 'File created by Mai' }
            };
          }
        }
      }
    }
    
    return null; // No tool request detected
  }

  detectToolMentions(response, availableTools) {
    const mentions = [];
    for (const [connectionName, tools] of Object.entries(availableTools)) {
      for (const tool of tools) {
        if (response.toLowerCase().includes(tool.name.toLowerCase()) || 
            response.toLowerCase().includes(connectionName.toLowerCase())) {
          mentions.push({ connection: connectionName, tool: tool.name });
        }
      }
    }
    return mentions;
  }

  clearConversationHistory() {
    this.conversationHistory = [];
    this.saveConversationHistory();
  }

  saveConversationHistory() {
    // Keep only last 50 messages to prevent storage bloat
    const trimmedHistory = this.conversationHistory.slice(-50);
    this.store.set('conversationHistory', trimmedHistory);
    this.conversationHistory = trimmedHistory;
  }

  getConversationHistory() {
    return this.conversationHistory;
  }

  updateSystemPrompt(newPrompt) {
    this.systemPrompt = newPrompt;
    this.store.set('systemPrompt', newPrompt);
  }

  getAvailableModels() {
    return [
      'gpt-4',
      'gpt-4-turbo',
      'gpt-3.5-turbo',
      'gpt-3.5-turbo-16k'
    ];
  }
}

module.exports = { AIService };
