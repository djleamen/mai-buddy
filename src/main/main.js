/*
 * Main process for Mai Buddy
 * Initializes the application and manages the main window, tray, and services.
 */

const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { AIService } = require('./services/ai-service');
const { VoiceService } = require('./services/voice-service');
const { MCPManager } = require('./services/mcp-manager');
const { HotkeyManager } = require('./services/hotkey-manager');

class MaiBuddyApp {
  constructor() {
    this.store = new Store();
    this.mainWindow = null;
    this.chatWindow = null;
    this.tray = null;
    this.aiService = new AIService();
    this.voiceService = new VoiceService();
    this.mcpManager = new MCPManager();
    this.hotkeyManager = new HotkeyManager();
    this.isQuitting = false;
  }

  async initialize() {
    await this.createMainWindow();
    await this.createTray();
    await this.setupServices();
    await this.registerGlobalShortcuts();
    await this.setupIpcHandlers();
  }

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

  async registerGlobalShortcuts() {
    // Global shortcuts are now handled by HotkeyManager
    // Set up IPC event listeners for hotkey actions
    console.log('Setting up hotkey event listeners');
    
    ipcMain.on('hotkey-show-chat', () => {
      try {
        console.log('Hotkey show-chat triggered');
      } catch (err) {
        // Ignore console errors to prevent app crashes
      }
      this.toggleChatWindow();
    });
    
    ipcMain.on('hotkey-voice-activation', () => {
      try {
        console.log('Hotkey voice-activation triggered');
      } catch (err) { /* Ignore console errors to prevent app crashes */ }
      this.activateVoiceMode();
    });
    
    ipcMain.on('hotkey-quick-capture', () => {
      try {
        console.log('Hotkey quick-capture triggered');
      } catch (err) { /* Ignore console errors to prevent app crashes */ }
      // TODO: Implement quick capture functionality
    });
    
    ipcMain.on('hotkey-toggle-listening', () => {
      try {
        console.log('Hotkey toggle-listening triggered');
      } catch (err) { /* Ignore console errors to prevent app crashes */ }
      // TODO: Implement toggle listening functionality
    });
    
    ipcMain.on('hotkey-hide-window', () => {
      try {
        console.log('Hotkey hide-window triggered');
      } catch (err) { /* Ignore console errors to prevent app crashes */ }
      this.hideChatWindow();
    });
  }

  setupIpcHandlers() {
    // Settings handlers
    ipcMain.handle('get-settings', async () => {
      try {
        const settings = this.store.get('settings', {
          openaiApiKey: '',
          elevenLabsApiKey: '',
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
          console.log('🔧 Tool executed successfully:', response.toolResult);
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

    ipcMain.handle('get-mcp-connections', async () => {
      try {
        const connections = this.mcpManager.getConnections();
        return connections;
      } catch (error) {
        console.error('Error getting MCP connections:', error);
        return [];
      }
    });

    ipcMain.handle('get-available-mcp-types', async () => {
      try {
        const types = this.mcpManager.getAvailableConnectionTypes();
        return types;
      } catch (error) {
        console.error('Error getting available MCP types:', error);
        return [];
      }
    });

    ipcMain.handle('add-mcp-connection', async (event, connection) => {
      try {
        const result = await this.mcpManager.addConnection(connection);
        return { success: true, result };
      } catch (error) {
        console.error('Error adding MCP connection:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('remove-mcp-connection', async (event, connectionId) => {
      try {
        const result = await this.mcpManager.removeConnection(connectionId);
        return { success: true, result };
      } catch (error) {
        console.error('Error removing MCP connection:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('test-mcp-connection', async (event, connectionId) => {
      try {
        const result = await this.mcpManager.testConnection(connectionId);
        return { success: true, result };
      } catch (error) {
        console.error('Error testing MCP connection:', error);
        return { success: false, error: error.message };
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
  }

  showChatWindow() {
    console.log('showChatWindow called');
    if (this.mainWindow) {
      console.log('Main window exists, showing...');
      this.mainWindow.show();
      this.mainWindow.focus();
      console.log('Window shown and focused');
    } else {
      console.log('Main window does not exist!');
    }
  }

  hideChatWindow() {
    if (this.mainWindow) {
      this.mainWindow.hide();
    }
  }

  toggleChatWindow() {
    if (this.mainWindow) {
      if (this.mainWindow.isVisible()) {
        this.hideChatWindow();
      } else {
        this.showChatWindow();
      }
    }
  }

  async activateVoiceMode() {
    await this.voiceService.startListening();
  }

  showSettings() {
    // Implementation for settings window
    console.log('Opening settings...');
  }

  showMCPManager() {
    // Implementation for MCP manager window
    console.log('Opening MCP manager...');
  }
}

// App event handlers
app.whenReady().then(async () => {
  const maiBuddy = new MaiBuddyApp();
  await maiBuddy.initialize();
  
  global.maiBuddy = maiBuddy;

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      maiBuddy.createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', async () => {
  globalShortcut.unregisterAll();
  
  if (global.maiBuddy && global.maiBuddy.mcpManager) {
    await global.maiBuddy.mcpManager.cleanup();
  }
});

module.exports = { MaiBuddyApp };
