# Mai Buddy Desktop AI Agent

Mai Buddy is a highly customizable, personal AI agent that runs as a desktop application. It features GPT integration, ElevenLabs voice synthesis, and dozens of MCP (Model Context Protocol) connections for extending functionality.

## Features

### 🤖 AI Integration
- **GPT-4 Support**: Powered by OpenAI's latest models
- **Customizable System Prompts**: Tailor the AI's personality and behavior
- **Conversation Memory**: Maintains context across sessions
- **Multiple Model Support**: Choose from GPT-4, GPT-4 Turbo, and GPT-3.5 Turbo

### 🎤 Voice Capabilities
- **ElevenLabs Integration**: High-quality text-to-speech
- **Voice Activation**: Respond to "Mai Buddy" trigger phrase
- **Multiple Voice Options**: Choose from various AI voices
- **Real-time Speech Recognition**: Voice input support

### 🔌 MCP Connections (30+ Integrations)
- **Development**: GitHub ✨, GitLab, VS Code, Docker
- **Communication**: Slack, Discord, Microsoft Teams
- **Productivity**: Notion, Trello, Asana
- **Cloud Services**: AWS, Google Cloud, Azure, DigitalOcean
- **Databases**: PostgreSQL, MySQL, MongoDB, Redis
- **AI/ML**: Hugging Face, Anthropic, Replicate
- **Finance**: Stripe, Plaid, Salesforce
- **Media**: YouTube, Spotify, Unsplash
- **System**: File System, Terminal, Calendar
- **Custom**: Build your own MCP servers

### 🎨 User Experience
- **Always Available**: Runs in system tray
- **Global Hotkeys**: Quick access with keyboard shortcuts
- **Customizable Interface**: Modern, responsive design
- **Cross-Platform**: Works on macOS, Windows, and Linux

## Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn
- OpenAI API key
- ElevenLabs API key (optional, for voice features)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/djleamen/mai-buddy.git
   cd mai-buddy
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the application**
   ```bash
   npm start
   ```

4. **Configure API keys**
   - Click the settings icon in the app
   - Add your OpenAI API key
   - Optionally add ElevenLabs API key for voice features

## Configuration

### API Keys
- **OpenAI**: Required for AI functionality
- **ElevenLabs**: Optional for text-to-speech
- **Service-specific keys**: Required for each MCP connection you want to use

### Hotkeys (Default)
- `Cmd/Ctrl + Shift + M`: Show/hide chat window
- `Cmd/Ctrl + Shift + V`: Voice activation
- `Cmd/Ctrl + Shift + C`: Quick capture
- `Cmd/Ctrl + Shift + L`: Toggle listening
- `Escape`: Hide window

### Voice Settings
- **Voice Selection**: Choose from available ElevenLabs voices
- **Stability**: Control voice consistency (0.0 - 1.0)
- **Similarity Boost**: Enhance voice similarity (0.0 - 1.0)
- **Trigger Phrase**: "Mai Buddy" (customizable)

## MCP Connections

Mai Buddy supports the Model Context Protocol for extending functionality. Available connection types:

### Development Tools
- **GitHub**: Repository management, issue tracking, code search
- **GitLab**: Project management, CI/CD, merge requests
- **VS Code**: Editor integration, file operations
- **Docker**: Container management, image building

### Communication Platforms
- **Slack**: Team messaging, channel management
- **Discord**: Server management, voice channels
- **Microsoft Teams**: Collaboration, meetings

### Productivity Services
- **Notion**: Database management, page creation
- **Trello**: Board management, card operations
- **Asana**: Project tracking, task management

### Cloud Platforms
- **AWS**: EC2, S3, Lambda management
- **Google Cloud**: Compute Engine, Cloud Storage
- **Azure**: Virtual machines, storage accounts
- **DigitalOcean**: Droplet management, Spaces

### Databases
- **PostgreSQL**: Query execution, schema management
- **MySQL**: Table operations, data import
- **MongoDB**: Document operations, collections
- **Redis**: Key-value operations, caching

## Development

### Building

```bash
# Development mode
npm run dev

# Build for current platform
npm run build

# Build for specific platforms
npm run build-mac
npm run build-win
npm run build-linux
```

### Custom MCP Servers

Create custom MCP servers to extend Mai Buddy's capabilities:

```javascript
// Example custom MCP server
const WebSocket = require('ws');

const server = new WebSocket.Server({ port: 3001 });

server.on('connection', (ws) => {
  ws.on('message', (data) => {
    const message = JSON.parse(data);
    
    if (message.method === 'tools/call') {
      // Handle custom tool calls
      const result = handleCustomTool(message.params);
      
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: message.id,
        result: result
      }));
    }
  });
});
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📧 Email: dilara_leamen@icloud.com
- 🐛 Issues: [GitHub Issues](https://github.com/djleamen/mai-buddy/issues)

## Roadmap

- [ ] Plugin system for custom extensions
- [ ] Local LLM support (Ollama integration)
- [ ] Advanced voice commands and workflows
- [ ] Mobile companion app
- [ ] Team collaboration features
- [ ] Workflow automation builder
- [ ] Enhanced MCP protocol support

---

**Mai Buddy** - Your personal AI companion, always ready to assist! 🤖✨
