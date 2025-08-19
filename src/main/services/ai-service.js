/*
 * This file contains the AIService class, which handles communication with the OpenAI API
 * and manages conversation history. Note that this file assumes macOS file paths.
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

      this.conversationHistory.push({
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString()
      });

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

    const connections = mcpManager.getConnections();
    const activeConnections = connections.filter(conn => conn.status === 'connected');

    if (activeConnections.length === 0) {
      return await this.processMessage(message);
    }

    // Enhanced processing with MCP tool integration
    const mcpContext = activeConnections.map(conn => ({
      name: conn.name,
      description: conn.description,
      capabilities: conn.capabilities,
      category: conn.category
    }));

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

    const toolRequest = this.analyzeToolRequest(message, availableTools);
    
    if (toolRequest) {
      try {
        console.log(`🔧 Executing tool: ${toolRequest.toolName} on ${toolRequest.connectionName}`);
        const toolResult = await mcpManager.executeTool(
          toolRequest.connectionId, 
          toolRequest.toolName, 
          toolRequest.parameters
        );

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
      return await this.processMessage(message);
    }
  }

  analyzeToolRequest(message, availableTools) {
    const lowerMessage = message.toLowerCase();
    
    // Try different tool request types in order
    return this.analyzeCommandRequest(message, lowerMessage, availableTools) ||
           this.analyzeListDirectoryRequest(message, lowerMessage, availableTools) ||
           this.analyzeReadFileRequest(message, lowerMessage, availableTools) ||
           this.analyzeWriteFileRequest(message, lowerMessage, availableTools) ||
           null;
  }

  analyzeCommandRequest(message, lowerMessage, availableTools) {
    if (!this.isCommandRequest(lowerMessage)) {
      return null;
    }

    const command = this.extractCommand(message, lowerMessage);
    if (!command) {
      return null;
    }

    const terminalTools = availableTools['Local Terminal'];
    if (!terminalTools) {
      return null;
    }

    const executeTool = terminalTools.find(t => t.name === 'execute_command');
    if (!executeTool) {
      return null;
    }

    return {
      connectionId: executeTool.connectionId,
      connectionName: 'Local Terminal',
      toolName: 'execute_command',
      parameters: { command }
    };
  }

  isCommandRequest(lowerMessage) {
    return lowerMessage.includes('run ') || 
           lowerMessage.includes('execute ') || 
           lowerMessage.includes('command ') || 
           lowerMessage.includes('./') ||
           lowerMessage.includes('.sh') || 
           lowerMessage.includes('/');
  }

  extractCommand(message, lowerMessage) {
    const absolutePathMatch = message.match(/\/[\w.-/]+\.sh/);
    if (absolutePathMatch) {
      return absolutePathMatch[0];
    }
    
    const scriptMatch = message.match(/\.\/[\w.-]+/);
    if (scriptMatch) {
      return scriptMatch[0];
    }
    
    const scriptNameMatch = message.match(/\b([\w.-]+\.sh)\b/);
    if (scriptNameMatch) {
      const scriptName = scriptNameMatch[1];
      return lowerMessage.includes('root') ? `/${scriptName}` : `${this.userHomePath}/${scriptName}`;
    }
    
    const quotedMatch = message.match(/['"`]([^'"`]+)['"`]/);
    if (quotedMatch) {
      return quotedMatch[1];
    }
    
    const runMatch = message.match(/(?:run|execute)\s+(.+?)(?:\s|$)/i);
    if (runMatch) {
      return runMatch[1].trim();
    }
    
    return null;
  }

  analyzeListDirectoryRequest(message, lowerMessage, availableTools) {
    if (!this.isListDirectoryRequest(lowerMessage)) {
      return null;
    }

    const path = this.extractDirectoryPath(message, lowerMessage);
    const fsTools = availableTools['Local File System'];
    if (!fsTools) {
      return null;
    }

    const listTool = fsTools.find(t => t.name === 'list_directory');
    if (!listTool) {
      return null;
    }

    return {
      connectionId: listTool.connectionId,
      connectionName: 'Local File System',
      toolName: 'list_directory',
      parameters: { path }
    };
  }

  isListDirectoryRequest(lowerMessage) {
    return (lowerMessage.includes('list ') && (lowerMessage.includes('files') || lowerMessage.includes('directory') || lowerMessage.includes('folder'))) ||
           (lowerMessage.includes('what\'s in') && (lowerMessage.includes('directory') || lowerMessage.includes('folder') || lowerMessage.includes('root'))) ||
           lowerMessage.includes('list them') ||
           lowerMessage.includes('list what') ||
           (lowerMessage.includes('list') && lowerMessage.includes(this.userHomePath.toLowerCase()));
  }

  extractDirectoryPath(message, lowerMessage) {
    let path = this.userHomePath;
    
    const userPathMatch = message.match(new RegExp(`${this.userHomePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[/\\w.-]*`, 'i'));
    if (userPathMatch) {
      path = userPathMatch[0];
      if (path.endsWith('/') && path !== `${this.userHomePath}/`) {
        path = path.slice(0, -1);
      }
      return path;
    }
    
    if (message.toLowerCase().includes(this.userHomePath.toLowerCase().replace('/', ''))) {
      const usernamePart = this.userHomePath.split('/').pop();
      const partialPathMatch = message.match(new RegExp(`Users\\/${usernamePart}[\\/\\w.-]*`, 'i'));
      return partialPathMatch ? '/' + partialPathMatch[0] : this.userHomePath;
    }
    
    return this.getSpecialDirectoryPath(lowerMessage, message);
  }

  getSpecialDirectoryPath(lowerMessage, message) {
    if (lowerMessage.includes('root') && !lowerMessage.includes('project root')) {
      return this.userHomePath;
    }
    if (lowerMessage.includes('desktop')) {
      return `${this.userHomePath}/Desktop`;
    }
    if (lowerMessage.includes('downloads')) {
      return `${this.userHomePath}/Downloads`;
    }
    if (lowerMessage.includes('documents')) {
      return `${this.userHomePath}/Documents`;
    }
    if (lowerMessage.includes('project')) {
      return process.cwd();
    }
    
    const absolutePathMatch = message.match(/\/[\w.-/]+/);
    if (absolutePathMatch && !absolutePathMatch[0].includes(this.userHomePath)) {
      return absolutePathMatch[0];
    }
    
    return this.userHomePath;
  }

  analyzeReadFileRequest(message, lowerMessage, availableTools) {
    if (!this.isReadFileRequest(lowerMessage)) {
      return null;
    }

    const path = this.extractFilePath(message, lowerMessage, 'read');
    if (!path) {
      return null;
    }

    const fsTools = availableTools['Local File System'];
    if (!fsTools) {
      return null;
    }

    const readTool = fsTools.find(t => t.name === 'read_file');
    if (!readTool) {
      return null;
    }

    return {
      connectionId: readTool.connectionId,
      connectionName: 'Local File System',
      toolName: 'read_file',
      parameters: { path }
    };
  }

  isReadFileRequest(lowerMessage) {
    return (lowerMessage.includes('read ') && lowerMessage.includes('file')) ||
           (lowerMessage.includes('what\'s in') && (lowerMessage.includes('.txt') || lowerMessage.includes('.js') || lowerMessage.includes('.json') || lowerMessage.includes('.md'))) ||
           lowerMessage.includes('show me the content');
  }

  extractFilePath(message, lowerMessage, operation) {
    const explicitPathMatch = message.match(new RegExp(`${this.userHomePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[/\\w.-]*`, 'i'));
    if (explicitPathMatch) {
      return explicitPathMatch[0];
    }
    
    const fileExtMatch = message.match(/\b([\w.-]+\.(txt|js|json|md|sh|py|html|css))\b/i);
    if (fileExtMatch) {
      return this.getFilePathFromExtension(fileExtMatch[1], lowerMessage);
    }
    
    const absolutePathMatch = message.match(/\/[\w.-/]+/);
    if (absolutePathMatch) {
      return absolutePathMatch[0];
    }
    
    const pathMatch = message.match(/(?:read|in)\s+(?:the\s+)?(?:file\s+)?([^\s]+)/i);
    if (pathMatch) {
      const path = pathMatch[1];
      return (lowerMessage.includes('root') && !path.startsWith('/')) ? `${this.userHomePath}/${path}` : path;
    }
    
    return null;
  }

  getFilePathFromExtension(fileName, lowerMessage) {
    if (lowerMessage.includes('root') || lowerMessage.includes('my root')) {
      return `${this.userHomePath}/${fileName}`;
    }
    if (lowerMessage.includes('desktop')) {
      return `${this.userHomePath}/Desktop/${fileName}`;
    }
    return fileName.startsWith('/') ? fileName : `${this.userHomePath}/${fileName}`;
  }

  analyzeWriteFileRequest(message, lowerMessage, availableTools) {
    if (!this.isWriteFileRequest(lowerMessage)) {
      return null;
    }

    const { path, content } = this.extractWriteFileParams(message, lowerMessage);
    if (!path) {
      return null;
    }

    const fsTools = availableTools['Local File System'];
    if (!fsTools) {
      return null;
    }

    const writeTool = fsTools.find(t => t.name === 'write_file');
    if (!writeTool) {
      return null;
    }

    return {
      connectionId: writeTool.connectionId,
      connectionName: 'Local File System',
      toolName: 'write_file',
      parameters: { path, content: content || 'File created by Mai' }
    };
  }

  isWriteFileRequest(lowerMessage) {
    return (lowerMessage.includes('write ') && lowerMessage.includes('file')) ||
           (lowerMessage.includes('create ') && lowerMessage.includes('file')) ||
           lowerMessage.includes('create it') ||
           lowerMessage.includes('make a file');
  }

  extractWriteFileParams(message, lowerMessage) {
    let path = '';
    let content = '';
    
    if ((lowerMessage.includes('desktop') && lowerMessage.includes('mai')) || lowerMessage.includes('create it')) {
      path = `${this.userHomePath}/Desktop/message.txt`;
      content = 'Hi, I\'m Mai';
      return { path, content };
    }
    
    const fileMatch = message.match(/file\s+(?:called\s+|named\s+)?([^\s]+)/i);
    if (fileMatch) {
      const fileName = fileMatch[1];
      path = lowerMessage.includes('desktop') ? `${this.userHomePath}/Desktop/${fileName}` : fileName;
    }
    
    const contentMatch = message.match(/['"`]([^'"`]+)['"`]/);
    if (contentMatch) {
      content = contentMatch[1];
    }
    
    return { path, content };
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
