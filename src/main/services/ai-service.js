/**
 * AI Service Module
 * Handles OpenAI interactions, conversation management, and MCP tool integration.
 * 
 * Author: DJ Leamen, 2025-2026
 */

const OpenAI = require('openai');
const Store = require('electron-store');
const { PromptManager } = require('./prompts/prompt-manager');
require('dotenv').config();

class AIService {
  constructor() {
    /**
     * Creates an AIService instance.
     * Initializes OpenAI client, conversation history, and prompt manager.
     */
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
    /**
     * Initializes the OpenAI client and loads conversation history.
     * Validates and cleans conversation history from storage.
     * 
     * @async
     * @returns {Promise<void>}
     */
    const settings = this.store.get('settings', {});
    
    if (settings.openaiApiKey) {
      this.openai = new OpenAI({
        apiKey: settings.openaiApiKey
      });
    }

    // Load and validate conversation history
    const storedHistory = this.store.get('conversationHistory', []);
    this.conversationHistory = this.validateConversationHistory(storedHistory);
    
    // If history was corrupted, save the cleaned version
    if (this.conversationHistory.length !== storedHistory.length) {
      console.log('Cleaned corrupted conversation history');
      this.saveConversationHistory();
    }
  }

  validateConversationHistory(history) {
    /**
     * Cleans the conversation history by removing invalid messages.
     * 
     * @param {Array} history - The conversation history array.
     * @returns {Array} Cleaned conversation history.
     */
    const cleaned = [];
    
    for (let i = 0; i < history.length; i++) {
      const msg = history[i];
      
      // Skip messages with null or undefined content (unless they have tool_calls)
      if (!msg.content && !msg.tool_calls) {
        console.log(`Skipping message ${i} with null content`);
        continue;
      }
      
      // Skip tool messages that don't have a preceding assistant message with tool_calls
      if (msg.role === 'tool') {
        const prevMsg = cleaned[cleaned.length - 1];
        if (!prevMsg || prevMsg.role !== 'assistant' || !prevMsg.tool_calls) {
          console.log(`Skipping orphaned tool message ${i}`);
          continue;
        }
      }
      
      // Ensure content is never null
      if (msg.role === 'assistant' && !msg.content) {
        msg.content = '';
      }
      
      cleaned.push(msg);
    }
    
    return cleaned;
  }

  async processMessage(message, options = {}) {
    /**
     * Processes a user message and returns AI response.
     * 
     * @param {string} message - The user message to process.
     * @param {object} options - Additional options for processing.
     * @returns {object} AI response and metadata.
     */
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

      // Prepare messages for API call - filter out any invalid messages
      const validHistory = this.conversationHistory.slice(-10).filter(msg => {
        // Keep messages that have valid content OR are assistant messages with tool_calls
        return (msg.content && msg.content !== null) || 
               (msg.role === 'assistant' && msg.tool_calls);
      }).map(msg => {
        // For OpenAI API, only include role and content (strip timestamps and other fields)
        const apiMsg = {
          role: msg.role,
          content: msg.content || '' // Ensure content is never null
        };
        
        // Include tool_calls and tool_call_id if they exist
        if (msg.tool_calls) apiMsg.tool_calls = msg.tool_calls;
        if (msg.tool_call_id) apiMsg.tool_call_id = msg.tool_call_id;
        
        return apiMsg;
      });
      
      const messages = [
        { role: 'system', content: this.systemPrompt },
        ...validHistory
      ];

      const completion = await this.openai.chat.completions.create({
        model: options.model || 'gpt-4-turbo',
        messages: messages,
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
        stream: false
      });

      const response = completion.choices[0].message.content || 'I processed your request.';

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
    /**
     * Processes a user message with MCP tool integration.
     * 
     * @param {string} message - The user message to process.
     * @param {MCPManager|null} mcpManager - The MCP Manager instance.
     * @returns {object} AI response and metadata.
     */
    if (!mcpManager) {
      return await this.processMessage(message);
    }

    const connections = mcpManager.getConnections();
    const activeConnections = connections.filter(conn => conn.status === 'connected');

    if (activeConnections.length === 0) {
      return await this.processMessage(message);
    }

    // Get available tools and format for OpenAI function calling
    const toolsForOpenAI = [];
    const toolMapping = new Map(); // Maps function names to connection info
    
    for (const conn of activeConnections) {
      try {
        const tools = await mcpManager.getAvailableTools(conn.id);
        for (const tool of tools) {
          const functionName = `${conn.name.toLowerCase().replace(/\s+/g, '_')}_${tool.name}`;
          toolsForOpenAI.push({
            type: 'function',
            function: {
              name: functionName,
              description: `${tool.description} (via ${conn.name})`,
              parameters: tool.parameters || {
                type: 'object',
                properties: {},
                required: []
              }
            }
          });
          toolMapping.set(functionName, {
            connectionId: conn.id,
            connectionName: conn.name,
            toolName: tool.name
          });
        }
      } catch (error) {
        console.error(`Failed to get tools for ${conn.name}:`, error);
      }
    }

    try {
      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      });

      const completion = await this.openai.chat.completions.create({
        model: this.store.get('settings.model', 'gpt-4'),
        messages: [
          { role: 'system', content: this.systemPrompt },
          ...this.conversationHistory
        ],
        tools: toolsForOpenAI.length > 0 ? toolsForOpenAI : undefined,
        tool_choice: toolsForOpenAI.length > 0 ? 'auto' : undefined
      });

      const responseMessage = completion.choices[0].message;

      // Check if GPT wants to call any tools
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        console.log(`GPT requested ${responseMessage.tool_calls.length} tool call(s)`);
        
        // Add assistant's message with tool calls to history (ensure content is never null)
        this.conversationHistory.push({
          role: 'assistant',
          content: responseMessage.content || '',
          tool_calls: responseMessage.tool_calls,
          timestamp: new Date().toISOString()
        });

        for (const toolCall of responseMessage.tool_calls) {
          const functionName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          
          const toolInfo = toolMapping.get(functionName);
          if (!toolInfo) {
            console.error(`Unknown function: ${functionName}`);
            continue;
          }

          console.log(`Executing: ${toolInfo.toolName} on ${toolInfo.connectionName}`);
          console.log('Parameters:', args);

          try {
            const result = await mcpManager.executeTool(
              toolInfo.connectionId,
              toolInfo.toolName,
              args
            );

            // Add tool result to conversation with truncation for large responses
            let resultContent = JSON.stringify(result);
            const MAX_RESULT_TOKENS = 5000; // Approximate token limit for tool results (can adjust as needed)
            const MAX_RESULT_CHARS = MAX_RESULT_TOKENS * 4; // as 1 token ≈ 4 chars
            
            if (resultContent.length > MAX_RESULT_CHARS) {
              console.log(`⚠️ Tool result too large (${resultContent.length} chars), truncating...`);
              const parsedResult = JSON.parse(resultContent);
              
              if (parsedResult.files && Array.isArray(parsedResult.files)) {
                const fileCount = parsedResult.files.length;
                const truncatedFiles = parsedResult.files.slice(0, 50);
                resultContent = JSON.stringify({
                  success: true,
                  files: truncatedFiles,
                  total_count: fileCount,
                  truncated: fileCount > 50,
                  message: `Showing first 50 of ${fileCount} files. Use more specific patterns to see all results.`
                });
              } else {
                // Generic truncation
                resultContent = resultContent.substring(0, MAX_RESULT_CHARS) + 
                  '... [TRUNCATED: Result too large]';
              }
            }
            
            this.conversationHistory.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: resultContent,
              timestamp: new Date().toISOString()
            });

            console.log('✅ Tool executed successfully');
          } catch (error) {
            console.error('❌ Tool execution failed:', error);
            this.conversationHistory.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: error.message }),
              timestamp: new Date().toISOString()
            });
          }
        }

        // Get final response from GPT after tool execution
        const finalCompletion = await this.openai.chat.completions.create({
          model: this.store.get('settings.model', 'gpt-4'),
          messages: [
            { role: 'system', content: this.systemPrompt },
            ...this.conversationHistory
          ]
        });

        const finalResponse = finalCompletion.choices[0].message.content || 'I completed the requested task.';
        this.conversationHistory.push({
          role: 'assistant',
          content: finalResponse,
          timestamp: new Date().toISOString()
        });

        this.saveConversationHistory();

        return {
          response: finalResponse,
          model: this.store.get('settings.model', 'gpt-4'),
          toolsUsed: responseMessage.tool_calls.map(tc => {
            const info = toolMapping.get(tc.function.name);
            return info ? `${info.toolName} (${info.connectionName})` : tc.function.name;
          })
        };
      }

      // No tools called, just return the response
      this.conversationHistory.push({
        role: 'assistant',
        content: responseMessage.content || 'I understand your request.',
        timestamp: new Date().toISOString()
      });

      this.saveConversationHistory();

      return {
        response: responseMessage.content,
        model: this.store.get('settings.model', 'gpt-4')
      };

    } catch (error) {
      console.error('Error in MCP-enhanced processing:', error);
      
      // Clean up conversation history to maintain valid state
      // Remove any trailing tool messages first
      while (this.conversationHistory.length > 0 && 
             this.conversationHistory[this.conversationHistory.length - 1].role === 'tool') {
        this.conversationHistory.pop();
      }
      
      // Remove assistant message with tool_calls if it exists
      if (this.conversationHistory.length > 0 && 
          this.conversationHistory[this.conversationHistory.length - 1].role === 'assistant' &&
          this.conversationHistory[this.conversationHistory.length - 1].tool_calls) {
        this.conversationHistory.pop();
      }
      
      // Remove the user message that caused the error
      if (this.conversationHistory.length > 0 && 
          this.conversationHistory[this.conversationHistory.length - 1].role === 'user') {
        this.conversationHistory.pop();
      }
      
      // Save cleaned up history
      this.saveConversationHistory();
      
      // Rate limit error
      if (error.status === 429 || error.code === 'rate_limit_exceeded') {
        return {
          response: 'I apologize, but the result from that tool was too large for me to process. Please try a more specific query or filter your search to reduce the amount of data returned.',
          model: this.store.get('settings.model', 'gpt-4'),
          error: true
        };
      }
      
      // For other errors, try standard processing only if message is valid
      if (message && typeof message === 'string' && message.trim()) {
        try {
          return await this.processMessage(message);
        } catch (fallbackError) {
          console.error('Fallback processing also failed:', fallbackError);
          return {
            response: 'I encountered an error processing your request. Please try rephrasing your question or breaking it into smaller parts.',
            model: this.store.get('settings.model', 'gpt-4'),
            error: true
          };
        }
      }
      
      return {
        response: 'I encountered an error processing your request. Please try again.',
        model: this.store.get('settings.model', 'gpt-4'),
        error: true
      };
    }
  }

  analyzeToolRequest(message, availableTools) {
    /**
     * Analyzes the message to determine if it is a tool request.
     * 
     * @param {string} message - The user message to analyze.
     * @param {object} availableTools - The available MCP tools.
     * @return {object|null} Tool call details or null if no tool request detected.
     */
    const lowerMessage = message.toLowerCase();
    return this.analyzeCommandRequest(message, lowerMessage, availableTools) ||
           null;
  }

  analyzeCommandRequest(message, lowerMessage, availableTools) {
    /**
     * Analyzes if the message is a command execution request.
     * 
     * @param {string} message - The user message.
     * @param {string} lowerMessage - The user message in lowercase.
     * @param {object} availableTools - The available MCP tools.
     * @return {object|null} Tool call details or null.
     */
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
    /**
     * Checks if the message indicates a command execution request.
     * 
     * @param {string} lowerMessage - The user message in lowercase.
     * @return {boolean} True if it's a command request, else false.
     */
    return lowerMessage.includes('./') ||
           lowerMessage.includes('.sh') ||
           /\b(echo|ls|pwd|cd|mkdir|rm|cat|grep|find|ps|top|curl|wget|git|npm|node|python|python3|brew|apt|yum|docker|cargo|go|rustc)\b/.test(lowerMessage);
  }

  extractCommand(message, lowerMessage) {
    /**
     * Extracts the command to execute from the message.
     * 
     * @param {string} message - The user message.
     * @param {string} lowerMessage - The user message in lowercase.
     * @return {string|null} The extracted command or null if none found.
     */
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
    
    const shellCommandMatch = message.match(/\b(echo|ls|pwd|cd|mkdir|rm|rmdir|cp|mv|cat|grep|find|ps|top|curl|wget|git|npm|yarn|pnpm|node|python|python3|ruby|java|javac|gcc|make|cmake|brew|apt|yum|docker|cargo|go|rustc)\s+[^.?!]+/i);
    if (shellCommandMatch) {
      let cmd = shellCommandMatch[0].trim();
      // Remove trailing phrases like "in my terminal"
      cmd = cmd.replace(/\s+(in|to|on)\s+(my|the)\s+(terminal|console|shell|command line|desktop|folder|directory).*$/i, '');
      return cmd.trim();
    }
    
    return null;
  }

  analyzeListDirectoryRequest(message, lowerMessage, availableTools) {
    /**
     * Analyzes if the message is a list directory request.
     * 
     * @param {string} message - The user message.
     * @param {string} lowerMessage - The user message in lowercase.
     * @param {object} availableTools - The available MCP tools.
     * @return {object|null} Tool call details or null.
     */
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
    /**
     * Checks if the message indicates a directory listing request.
     * 
     * @param {string} lowerMessage - The user message in lowercase.
     * @return {boolean} True if it's a list directory request, else false.
     */
    return (lowerMessage.includes('list ') && (lowerMessage.includes('files') || lowerMessage.includes('directory') || lowerMessage.includes('folder'))) ||
           (lowerMessage.includes('what\'s in') && (lowerMessage.includes('directory') || lowerMessage.includes('folder') || lowerMessage.includes('root'))) ||
           lowerMessage.includes('list them') ||
           lowerMessage.includes('list what') ||
           (lowerMessage.includes('list') && lowerMessage.includes(this.userHomePath.toLowerCase()));
  }

  extractDirectoryPath(message, lowerMessage) {
    /**
     * Extracts the directory path from the message.
     * 
     * @param {string} message - The user message.
     * @param {string} lowerMessage - The user message in lowercase.
     * @return {string} The extracted directory path.
     */
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
    /**
     * Determines special directory paths like Desktop, Downloads, etc.
     * 
     * @param {string} lowerMessage - The user message in lowercase.
     * @param {string} message - The original user message.
     * @return {string} The determined directory path.
     */
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
    /**
     * Analyzes if the message is a read file request.
     * 
     * @param {string} message - The user message.
     * @param {string} lowerMessage - The user message in lowercase.
     * @param {object} availableTools - The available MCP tools.
     * @return {object|null} Tool call details or null.
     */
    if (!this.isReadFileRequest(lowerMessage)) {
      return null;
    }

    const path = this.extractFilePath(message, lowerMessage);
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
    /**
     * Checks if the message indicates a read file request.
     * 
     * @param {string} lowerMessage - The user message in lowercase.
     * @return {boolean} True if it's a read file request, else false.
     */
    return (lowerMessage.includes('read ') && lowerMessage.includes('file')) ||
           (lowerMessage.includes('what\'s in') && (lowerMessage.includes('.txt') || lowerMessage.includes('.js') || lowerMessage.includes('.json') || lowerMessage.includes('.md'))) ||
           lowerMessage.includes('show me the content');
  }

  extractFilePath(message, lowerMessage) {
    /**
     * Extracts the file path from the user message.
     * 
     * @param {string} message - The original user message.
     * @param {string} lowerMessage - The user message in lowercase.
     * @return {string|null} The extracted file path or null if not found.
     */
    const explicitPathMatch = message.match(new RegExp(`${this.userHomePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[/\\w.-]*`, 'i'));
    if (explicitPathMatch) {
      return explicitPathMatch[0];
    }
   
    // Check for partial user home path
    const fileExtMatch = message.match(/\b([\w.-]+\.(txt|js|json|md|sh|py|html|css))\b/i);
    if (fileExtMatch) {
      return this.getFilePathFromExtension(fileExtMatch[1], lowerMessage);
    }
    
    // Check for absolute path
    const absolutePathMatch = message.match(/\/[\w.-/]+/);
    if (absolutePathMatch) {
      return absolutePathMatch[0];
    }
    
    // Check for relative path
    const pathMatch = message.match(/(?:read|in)\s+(?:the\s+)?(?:file\s+)?([^\s]+)/i);
    if (pathMatch) {
      const path = pathMatch[1];
      return (lowerMessage.includes('root') && !path.startsWith('/')) ? `${this.userHomePath}/${path}` : path;
    }
    
    return null;
  }

  getFilePathFromExtension(fileName, lowerMessage) {
    /**
     * Determines the full file path based on keywords in the message.
     * 
     * @param {string} fileName - The file name with extension.
     * @param {string} lowerMessage - The user message in lowercase.
     * @return {string} The full file path.
     */
    if (lowerMessage.includes('root') || lowerMessage.includes('my root')) {
      return `${this.userHomePath}/${fileName}`;
    }
    if (lowerMessage.includes('desktop')) {
      return `${this.userHomePath}/Desktop/${fileName}`;
    }
    return fileName.startsWith('/') ? fileName : `${this.userHomePath}/${fileName}`;
  }

  analyzeWriteFileRequest(message, lowerMessage, availableTools) {
    /**
     * Analyzes if the message is a write file request and extracts parameters.
     * 
     * @param {string} message - The original user message.
     * @param {string} lowerMessage - The user message in lowercase.
     * @param {object} availableTools - The available MCP tools.
     * @return {object|null} Tool call details or null if no tool request detected.
     */
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
    /**
     * Checks if the message indicates a write file request.
     * 
     * @param {string} lowerMessage - The user message in lowercase.
     * @return {boolean} True if it's a write file request, else false.
     */
    return (lowerMessage.includes('write ') && lowerMessage.includes('file')) ||
           (lowerMessage.includes('create ') && lowerMessage.includes('file')) ||
           lowerMessage.includes('create it') ||
           lowerMessage.includes('make a file');
  }

  extractWriteFileParams(message, lowerMessage) {
    /**
     * Extracts the file path and content from the user message.
     * 
     * @param {string} message - The original user message.
     * @param {string} lowerMessage - The user message in lowercase.
     * @return {object} An object containing the path and content.
     */
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
    /**
     * Detects mentions of tools in the AI response.
     * 
     * @param {string} response - The AI response message.
     * @param {object} availableTools - The available MCP tools.
     * @return {Array} List of mentioned tools with connection info.
     */
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
    /**
     * Clears the conversation history and saves to storage.
     * 
     * @returns {void}
     */
    this.conversationHistory = [];
    this.saveConversationHistory();
  }

  saveConversationHistory() {
    /**
     * Saves conversation history to storage.
     * Keeps only the last 50 messages to prevent storage bloat.
     * 
     * @returns {void}
     */
    // Keep only last 50 messages to prevent storage bloat
    const trimmedHistory = this.conversationHistory.slice(-50);
    this.store.set('conversationHistory', trimmedHistory);
    this.conversationHistory = trimmedHistory;
  }

  getConversationHistory() {
    /**
     * Gets the current conversation history.
     * 
     * @returns {Array<Object>} The conversation history array.
     */
    return this.conversationHistory;
  }

  updateSystemPrompt(newPrompt) {
    /**
     * Updates the system prompt and saves it to storage.
     * 
     * @param {string} newPrompt - The new system prompt text.
     * @returns {void}
     */
    this.systemPrompt = newPrompt;
    this.store.set('systemPrompt', newPrompt);
  }

  getAvailableModels() {
    /**
     * Gets list of available OpenAI models.
     * 
     * @returns {Array<string>} Array of available model names.
     */
    return [
      'gpt-4',
      'gpt-4-turbo',
      'gpt-3.5-turbo',
      'gpt-3.5-turbo-16k'
    ];
  }
}

module.exports = { AIService };
