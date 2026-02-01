/**
 * MaiBuddyApp
 * Main application class for Mai Buddy AI assistant.
 * Manages windows, services, and IPC communication.
 * 
 * Author: DJ Leamen, 2025-2026
 */

const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage, screen, desktopCapturer } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { AIService } = require('./services/ai-service');
const { VoiceService } = require('./services/voice-service');
const { MCPManager } = require('./services/mcp-manager');
const { HotkeyManager } = require('./services/hotkey-manager');

/**
 * MaiBuddyApp class to encapsulate the main application logic.
 * Manages the entire application lifecycle, windows, services, and IPC communication.
 */
class MaiBuddyApp {
  /**
   * Creates a MaiBuddyApp instance.
   * Initializes all services, window references, and application state.
   */
  constructor() {
    this.store = new Store();
    this.mainWindow = null;
    this.chatWindow = null;
    this.terminalWindow = null;
    this.tray = null;
    this.aiService = new AIService();
    this.voiceService = new VoiceService();
    this.mcpManager = new MCPManager();
    this.hotkeyManager = new HotkeyManager();
    this.isQuitting = false;
    this.isListening = false;
  }

  /**
   * Initializes the application.
   * Creates windows, tray, services, shortcuts, and IPC handlers.
   * 
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    await this.createMainWindow();
    await this.createTray();
    await this.setupServices();
    await this.registerGlobalShortcuts();
    this.setupIpcHandlers();
  }

  /**
   * Creates the main chat window.
   * Configures window properties including transparency, always-on-top, and frameless design.
   * Sets up event handlers for window blur and close events.
   * 
   * @async
   * @returns {Promise<void>}
   */
  async createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 400,
      height: 600,
      show: false,
      frame: false,
      resizable: true,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true
      }
    });

    await this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    // Hide window when losing focus
    this.mainWindow.on('blur', () => {
      if (!this.isQuitting) {
        this.mainWindow.hide();
      }
    });

    this.mainWindow.on('close', (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.mainWindow.hide();
      }
    });
  }

  /**
   * Creates system tray icon and menu.
   * Provides quick access to show window, settings, MCP connections, and quit.
   * 
   * @async
   * @returns {Promise<void>}
   */
  async createTray() {
    const iconPath = path.join(__dirname, '../../assets/tray-icon.png');
    const trayIcon = nativeImage.createFromPath(iconPath);
    this.tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Mai Buddy',
        click: () => this.showChatWindow()
      },
      {
        label: 'Settings',
        click: () => this.showSettings()
      },
      {
        label: 'MCP Connections',
        click: () => this.showMCPManager()
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          this.isQuitting = true;
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);
    this.tray.setToolTip('Mai Buddy - Your AI Assistant');

    this.tray.on('click', () => {
      this.showChatWindow();
    });
  }

  /**
   * Initializes all services.
   * Starts AI, voice, MCP, and hotkey services.
   * Sets up trigger word detection for voice activation.
   * 
   * @async
   * @returns {Promise<void>}
   */
  async setupServices() {
    await this.aiService.initialize();
    await this.voiceService.initialize();
    await this.mcpManager.initialize();
    await this.hotkeyManager.initialize();

    // Set up trigger word detection
    this.voiceService.onTriggerWord('mai buddy', () => {
      this.showChatWindow();
    });
  }

  /**
   * Registers global shortcuts and IPC event listeners.
   * Sets up listeners for show-chat, voice-activation, quick-capture, toggle-listening, and hide-window.
   * 
   * @async
   * @returns {Promise<void>}
   */
  async registerGlobalShortcuts() {
    // Global shortcuts are now handled by HotkeyManager
    // Set up IPC event listeners for hotkey actions
    console.log('Setting up hotkey event listeners');
    
    ipcMain.on('hotkey-show-chat', () => {
      console.log('Hotkey show-chat triggered');
      this.toggleChatWindow();
    });
    
    ipcMain.on('hotkey-voice-activation', () => {
      console.log('Hotkey voice-activation triggered');
      this.activateVoiceMode();
    });
    
    ipcMain.on('hotkey-quick-capture', () => {
      console.log('Hotkey quick-capture triggered');
      this.captureScreenAndAnalyze();
    });
    ipcMain.on('hotkey-toggle-listening', () => {
      console.log('Hotkey toggle-listening triggered');
      this.toggleListening();
    });

    ipcMain.on('hotkey-hide-window', () => {
      console.log('Hotkey hide-window triggered');
      this.hideChatWindow();
    });
  }

  /**
   * Sets up IPC handlers for communication between renderer and main process.
   * Handles settings, messages, MCP management, voice services, and window management.
   * 
   * @returns {void}
   */
  setupIpcHandlers() {
    // Settings handlers
    ipcMain.handle('get-settings', async () => {
      try {
        const settings = this.store.get('settings', {
          provider: 'openai',
          apiKey: '',
          model: 'gpt-4',
          voice: 'Rachel',
          autoSpeak: false,
          hotkeys: {
            'show-chat': 'CommandOrControl+Shift+M',
            'voice-activation': 'CommandOrControl+Shift+V',
            'quick-capture': 'CommandOrControl+Shift+C',
            'toggle-listening': 'CommandOrControl+Shift+L'
          }
        });
        return settings;
      } catch (error) {
        console.error('Error getting settings:', error);
        return {};
      }
    });

    ipcMain.handle('save-settings', async (event, settings) => {
      try {
        this.store.set('settings', settings);
        
        await this.aiService.initialize();
        await this.voiceService.initialize();
        
        return { success: true };
      } catch (error) {
        console.error('Error saving settings:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('send-message', async (event, message) => {
      try {
        // Use MCP-enhanced processing if available
        const response = await this.aiService.processWithMCP(message, this.mcpManager);
        
        if (response.toolExecuted) {
          console.log('Tool executed successfully:', response.toolResult);
        } else if (response.toolError) {
          console.log('❌ Tool execution failed:', response.toolError);
        }
        
        return {
          success: true,
          response: response.response,
          usage: response.usage,
          model: response.model,
          toolExecuted: response.toolExecuted || false,
          toolResult: response.toolResult,
          toolError: response.toolError
        };
      } catch (error) {
        console.error('Error processing message:', error);
        return {
          success: false,
          error: error.message
        };
      }
    });    ipcMain.handle('clear-conversation', async () => {
      try {
        this.aiService.clearConversationHistory();
        return { success: true };
      } catch (error) {
        console.error('Error clearing conversation:', error);
        return { success: false, error: error.message };
      }
    });

    // MCP Management handlers
    ipcMain.handle('mcp-get-connections', async () => {
      try {
        return {
          success: true,
          connections: this.mcpManager.getConnections(),
          stats: this.mcpManager.getConnectionStats()
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('mcp-get-available-types', async () => {
      try {
        return {
          success: true,
          types: this.mcpManager.getAvailableConnectionTypes()
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('mcp-add-connection', async (event, connectionData) => {
      try {
        const connection = await this.mcpManager.addConnection(connectionData);
        return { success: true, connection };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('mcp-remove-connection', async (event, connectionId) => {
      try {
        const removed = await this.mcpManager.removeConnection(connectionId);
        return { success: true, removed };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('mcp-test-connection', async (event, connectionId) => {
      try {
        const result = await this.mcpManager.testConnectionWithPing(connectionId);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('mcp-get-tools', async (event, connectionId) => {
      try {
        const tools = await this.mcpManager.getAvailableTools(connectionId);
        return { success: true, tools };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('mcp-execute-tool', async (event, connectionId, toolName, parameters) => {
      try {
        const result = await this.mcpManager.executeTool(connectionId, toolName, parameters);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('mcp-reconnect-all', async () => {
      try {
        const results = await this.mcpManager.reconnectAll();
        return { success: true, results };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('get-conversation-history', async () => {
      try {
        const history = this.aiService.getConversationHistory();
        return history;
      } catch (error) {
        console.error('Error getting conversation history:', error);
        return [];
      }
    });

    // Voice Service handlers
    ipcMain.handle('text-to-speech', async (event, text, options) => {
      try {
        await this.voiceService.textToSpeech(text, options);
        return { success: true };
      } catch (error) {
        console.error('Error with text-to-speech:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('start-listening', async () => {
      try {
        await this.voiceService.startListening();
        return { success: true };
      } catch (error) {
        console.error('Error starting listening:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('stop-listening', async () => {
      try {
        this.voiceService.stopListening();
        return { success: true };
      } catch (error) {
        console.error('Error stopping listening:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('get-available-voices', async () => {
      try {
        const voices = await this.voiceService.getAvailableVoices();
        return voices;
      } catch (error) {
        console.error('Error getting available voices:', error);
        return [];
      }
    });

    // Window management
    ipcMain.handle('hide-window', () => {
      this.hideChatWindow();
      return { success: true };
    });

    ipcMain.handle('show-settings', () => {
      this.showSettings();
      return { success: true };
    });

    ipcMain.handle('show-mcp-manager', () => {
      this.showMCPManager();
      return { success: true };
    });

    ipcMain.handle('quit-app', () => {
      this.isQuitting = true;
      app.quit();
      return { success: true };
    });
  }

  /**
   * Shows the main chat window and brings it to focus.
   * 
   * @returns {void}
   */
  showChatWindow() {
    if (this.mainWindow) {
      this.mainWindow.show();
      this.mainWindow.focus();
    } else {
      console.log('Main window does not exist!');
    }
  }

  /**
   * Hides the main chat window.
   * 
   * @returns {void}
   */
  hideChatWindow() {
    if (this.mainWindow) {
      this.mainWindow.hide();
    }
  }

  /**
   * Toggles the visibility of the chat window.
   * Shows the window if hidden, hides it if visible.
   * 
   * @returns {void}
   */
  toggleChatWindow() {
    if (this.mainWindow) {
      if (this.mainWindow.isVisible()) {
        this.hideChatWindow();
      } else {
        this.showChatWindow();
      }
    }
  }

  /**
   * Activates voice mode by starting listening.
   * 
   * @async
   * @returns {Promise<void>}
   */
  async activateVoiceMode() {
    await this.voiceService.startListening();
    this.isListening = true;
  }

  /**
   * Toggles the listening state for voice input.
   * Notifies the renderer process of state changes.
   * 
   * @async
   * @returns {Promise<void>}
   */
  async toggleListening() {
    try {
      if (this.isListening) {
        this.voiceService.stopListening();
        this.isListening = false;
        console.log('Voice listening stopped');
      } else {
        await this.voiceService.startListening();
        this.isListening = true;
        console.log('Voice listening started');
      }
      
      // Notify renderer process of listening state change
      if (this.mainWindow) {
        this.mainWindow.webContents.send('listening-state-changed', this.isListening);
      }
    } catch (error) {
      console.error('Error toggling listening:', error);
      this.isListening = false;
    }
  }

  /**
   * Shows the settings view in the main window.
   * 
   * @returns {void}
   */
  showSettings() {
    if (this.mainWindow) {
      this.mainWindow.show();
      this.mainWindow.webContents.send('show-settings');
    }
  }

  /**
   * Shows the MCP manager view in the main window.
   * 
   * @returns {void}
   */
  showMCPManager() {
    if (this.mainWindow) {
      this.mainWindow.show();
      this.mainWindow.webContents.send('show-mcp-manager');
    }
  }

  /**
   * Creates and shows a terminal output window.
   * Displays command execution output with syntax highlighting.
   * 
   * @returns {BrowserWindow} The created terminal window instance.
   */
  createTerminalWindow() {
    if (this.terminalWindow) {
      this.terminalWindow.close();
    }

    this.terminalWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: true,
      frame: true,
      resizable: true,
      title: 'Mai Buddy - Terminal Output',
      backgroundColor: '#1e1e1e',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    // Create simple HTML for terminal window
    const terminalHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 20px;
            background: #1e1e1e;
            color: #d4d4d4;
            font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.5;
          }
          #output {
            white-space: pre-wrap;
            word-wrap: break-word;
          }
          .command {
            color: #4ec9b0;
            margin-bottom: 10px;
          }
          .error {
            color: #f48771;
          }
        </style>
      </head>
      <body>
        <div id="output"></div>
        <script>
          const { ipcRenderer } = require('electron');
          const output = document.getElementById('output');
          
          ipcRenderer.on('terminal-output', (event, data) => {
            output.textContent = data;
            window.scrollTo(0, document.body.scrollHeight);
          });
          
          ipcRenderer.on('terminal-command', (event, command) => {
            const cmdDiv = document.createElement('div');
            cmdDiv.className = 'command';
            cmdDiv.textContent = '$ ' + command;
            output.appendChild(cmdDiv);
            window.scrollTo(0, document.body.scrollHeight);
          });
          
          ipcRenderer.on('terminal-clear', () => {
            output.textContent = '';
          });
        </script>
      </body>
      </html>
    `;

    this.terminalWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(terminalHTML));

    this.terminalWindow.on('closed', () => {
      this.terminalWindow = null;
    });

    return this.terminalWindow;
  }

  /**
   * Captures the screen and sends it for AI analysis.
   * Takes a screenshot of the primary display and sends it to the renderer for processing.
   * 
   * @async
   * @returns {Promise<void>}
   */
  async captureScreenAndAnalyze() {
    try {
      console.log('Starting screen capture...');
      
      // Get primary display
      const primaryDisplay = screen.getPrimaryDisplay();
      
      // Capture the primary display
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: primaryDisplay.bounds.width, height: primaryDisplay.bounds.height }
      });
      
      if (sources.length === 0) {
        console.error('No screen sources found');
        return;
      }
      
      // Get the screenshot as base64
      const screenshot = sources[0].thumbnail.toDataURL();
      
      // Show the chat window and send the captured image for analysis
      this.showChatWindow();
      
      // Send the screenshot to the renderer process for AI analysis
      if (this.mainWindow) {
        this.mainWindow.webContents.send('process-screenshot', {
          image: screenshot,
          timestamp: new Date().toISOString()
        });
      }
      
      console.log('Screenshot captured and sent for analysis');
      
    } catch (error) {
      console.error('Error during screen capture:', error);
    }
  }
}

// App event handlers
(async () => {
  await app.whenReady();

  const maiBuddy = new MaiBuddyApp();
  await maiBuddy.initialize();

  // Make available globally for terminal window access
  global.maiBuddy = maiBuddy;
  globalThis.maiBuddy = maiBuddy;

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      maiBuddy.createMainWindow();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('will-quit', async () => {
    globalShortcut.unregisterAll();
    
    if (globalThis.maiBuddy?.mcpManager) {
      await globalThis.maiBuddy.mcpManager.cleanup();
    }
  });
})();

module.exports = { MaiBuddyApp };
