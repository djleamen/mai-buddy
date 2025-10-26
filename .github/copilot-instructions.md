# Copilot Instructions for Mai Buddy

## Project Overview
Mai Buddy is a desktop AI agent application built with Electron that integrates GPT-4, ElevenLabs voice synthesis, and the Model Context Protocol (MCP) for extensibility. The application runs in the system tray and provides always-available AI assistance through voice and text interfaces.

## Technology Stack
- **Runtime**: Node.js 18+
- **Framework**: Electron (desktop application)
- **AI Integration**: OpenAI GPT-4, GPT-4 Turbo, GPT-3.5 Turbo
- **Voice Services**: ElevenLabs text-to-speech
- **Protocols**: MCP (Model Context Protocol), WebSocket
- **State Management**: electron-store
- **Dependencies**: axios, ws, socket.io, express

## Architecture
- **Main Process** (`src/main/`): Electron main process handling window management, system tray, global shortcuts
- **Renderer Process** (`src/renderer/`): UI rendering and user interactions
- **Services** (`src/main/services/`):
  - `ai-service.js`: OpenAI API integration and conversation management
  - `voice-service.js`: ElevenLabs integration and speech recognition
  - `mcp-manager.js`: MCP connection management (GitHub and system integrations functional)
  - `mcp-server.js`: Local MCP server implementation
  - `mcp-tools.js`: MCP tool definitions and handlers
  - `hotkey-manager.js`: Global keyboard shortcut management
  - `prompts/`: System prompt management and templates

## Code Style & Conventions
- **Indentation**: 2 spaces (enforced by ESLint)
- **Quotes**: Single quotes for strings
- **Semicolons**: Required at end of statements
- **Naming**: 
  - Classes use PascalCase (e.g., `AIService`, `MCPManager`)
  - Methods and variables use camelCase
  - Constants use UPPER_SNAKE_CASE
- **Comments**: Include file-level JSDoc comments explaining purpose
- **Error Handling**: Use try-catch blocks and provide descriptive error messages
- **Async/Await**: Prefer async/await over promises for asynchronous operations

## Development Workflow

### Installation
```bash
npm install
```

### Running
```bash
npm start       # Run the application
npm run dev     # Development mode with hot reload
npm run watch   # Watch mode with nodemon
```

### Building
```bash
npm run build       # Build for current platform
npm run build-mac   # macOS build
npm run build-win   # Windows build
npm run build-linux # Linux build
```

### Code Quality
```bash
npm run lint    # Run ESLint
```

## Important Guidelines

### Security
- Never commit API keys or secrets to source code
- Use electron-store for secure storage of user credentials
- Validate all user inputs before processing
- Be cautious with nodeIntegration and contextIsolation settings

### MCP Integration
- As of August 2025, only GitHub and system integrations are fully functional
- MCP connections are work in progress - handle gracefully
- Use WebSocket protocol for MCP communication
- Store connection configurations in electron-store

### Electron Best Practices
- Keep main process lean, delegate heavy work to services
- Use IPC (Inter-Process Communication) for main/renderer communication
- Implement proper window lifecycle management
- Handle platform differences (macOS, Windows, Linux)

### Voice Features
- ElevenLabs integration is optional (gracefully degrade if not configured)
- Default trigger phrase is "Mai Buddy" (customizable)
- Speech recognition requires proper permissions

### State Management
- Use electron-store for persistent storage
- Store user settings, API keys, conversation history
- Handle missing or corrupted store data gracefully

## File Organization
- **Main entry point**: `src/main/main.js` (MaiBuddyApp class)
- **Services**: Self-contained service classes with clear responsibilities
- **Renderer**: UI code separate from main process logic
- **Assets**: Icons and resources in `/assets` directory
- **Config**: `.env.example` for environment variables template

## Testing
- Test command: `npm test` (Jest configuration)
- Manual testing recommended for Electron UI features
- Test MCP connections: `npm run test-mcp`

## Dependencies
- Keep dependencies up to date but test thoroughly before upgrading
- Electron and OpenAI are core dependencies - handle breaking changes carefully
- Some packages have deprecation warnings but are stable (e.g., eslint@8.x)

## Common Tasks

### Adding a New Service
1. Create class in `src/main/services/`
2. Initialize in `MaiBuddyApp` constructor
3. Call `initialize()` in `setupServices()`
4. Add IPC handlers if needed

### Adding MCP Connection
1. Add connection definition in `mcp-manager.js` `getAvailableMCPConnections()`
2. Implement tool handlers in `mcp-tools.js`
3. Update MCP server routes in `mcp-server.js` if needed

### Modifying System Prompts
- Edit templates in `src/main/services/prompts/config/`
- Use `PromptManager` to construct combined prompts
- Test with different configurations (tech context, user context)

## Known Issues & Notes
- File paths assume macOS conventions (noted in ai-service.js)
- Some MCP connections are placeholders awaiting implementation
- Voice features require system permissions and may need platform-specific handling
- Global shortcuts may conflict with other applications

## External Resources
- [Electron Documentation](https://www.electronjs.org/docs)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [MCP Specification](https://modelcontextprotocol.io/)
- [ElevenLabs API Docs](https://elevenlabs.io/docs)
