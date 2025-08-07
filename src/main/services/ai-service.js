const OpenAI = require('openai');
const Store = require('electron-store');

class AIService {
  constructor() {
    this.store = new Store();
    this.openai = null;
    this.conversationHistory = [];
    this.systemPrompt = `You are Mai Buddy, a highly customizable personal AI assistant. You are helpful, friendly, and efficient. 

IMPORTANT RESPONSE GUIDELINES:
- NEVER use markdown formatting (no **, ##, *, -, etc.)
- Always respond in plain text only
- Be conversational, casual, and friendly in tone
- Give detailed but condensed explanations
- Use natural language without formal structure
- Avoid bullet points, numbered lists, or headers
- Present information in flowing paragraphs

You can:
- Answer questions and provide information
- Help with tasks and productivity  
- Connect to various external services through MCP
- Provide voice responses
- Remember context from our conversation
    
Always be concise but thorough in your responses. If you need to use external tools or services, mention that you're connecting through your MCP integrations. Keep responses conversational and easy to read aloud.`;
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

      // Prepare messages for API call
      const messages = [
        { role: 'system', content: this.systemPrompt },
        ...this.conversationHistory.slice(-10).map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ];

      const completion = await this.openai.chat.completions.create({
        model: options.model || 'gpt-4',
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

  async processWithMCP(message, mcpConnections = []) {
    // Enhanced processing with MCP tool integration
    const mcpContext = mcpConnections.map(conn => ({
      name: conn.name,
      description: conn.description,
      capabilities: conn.capabilities
    }));

    const enhancedPrompt = `${this.systemPrompt}

Available MCP connections:
${mcpContext.map(mcp => `- ${mcp.name}: ${mcp.description}`).join('\n')}

User message: ${message}`;

    return await this.processMessage(enhancedPrompt);
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
