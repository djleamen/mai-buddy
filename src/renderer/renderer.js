/*
* Initializes the application and manages the main window, tray, and services.
*/

const { ipcRenderer } = require('electron');

class MaiBuddyRenderer {
  constructor() {
    /**
     * Creates a MaiBuddyRenderer instance.
     * Initializes state, elements, event listeners, and loads initial data.
     */
    this.isVoiceActive = false;
    this.currentSettings = {};
    this.mcpConnections = [];
    this.messages = [];
    this.isUserScrolledUp = false;
    
    this.initializeElements();
    this.setupEventListeners();
    this.showWelcomeMessage();
    
    // Delay initial data loading to ensure IPC handlers are ready
    setTimeout(() => {
      this.loadInitialData();
    }, 500);
  }

  initializeElements() {
    /**
     * Initializes and caches references to DOM elements.
     * 
     * @returns {void}
     */
    // Title bar elements
    this.settingsBtn = document.getElementById('settingsBtn');
    this.minimizeBtn = document.getElementById('minimizeBtn');
    this.quitBtn = document.getElementById('quitBtn');
    
    // Connection status elements
    this.connectionStatus = document.getElementById('connectionStatus');
    this.statusIndicator = this.connectionStatus.querySelector('.status-indicator');
    this.statusText = this.connectionStatus.querySelector('.status-text');
    this.mcpBtn = document.getElementById('mcpBtn');
    this.mcpCount = document.getElementById('mcpCount');
    
    // Chat elements
    this.chatMessages = document.getElementById('chatMessages');
    this.messageInput = document.getElementById('messageInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.voiceBtn = document.getElementById('voiceBtn');
    this.scrollToBottomBtn = document.getElementById('scrollToBottomBtn');
    
    // Modal elements
    this.settingsModal = document.getElementById('settingsModal');
    this.mcpModal = document.getElementById('mcpModal');
  }

  setupEventListeners() {
    /**
     * Sets up all event listeners for UI interactions.
     * Includes title bar, chat input, buttons, and IPC listeners.
     * 
     * @returns {void}
     */
    // Title bar buttons
    this.settingsBtn.addEventListener('click', () => this.showSettings());
    this.minimizeBtn.addEventListener('click', () => this.hideWindow());
    this.quitBtn.addEventListener('click', () => this.quitApp());
    
    // MCP button
    this.mcpBtn.addEventListener('click', () => this.showMCPManager());
    
    // Chat input
    this.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    
    this.messageInput.addEventListener('input', () => {
      this.autoResizeTextarea();
    });
    
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.voiceBtn.addEventListener('click', () => this.toggleVoiceMode());
    
    // Scroll to bottom button
    this.scrollToBottomBtn.addEventListener('click', () => this.scrollToBottom());
    
    this.setupChatScrolling();
    
    this.setupSettingsModal();
    
    this.setupMCPModal();
    
    this.autoResizeTextarea();
    
    // Setup IPC listeners from main process
    this.setupIPCListeners();
  }
  
  setupIPCListeners() {
    /**
     * Sets up IPC listeners for communication with main process.
     * Handles events for showing settings and MCP manager.
     * 
     * @returns {void}
     */
    // Listen for show-settings event from main process
    ipcRenderer.on('show-settings', () => {
      this.showSettings();
    });
    
    // Listen for show-mcp-manager event from main process
    ipcRenderer.on('show-mcp-manager', () => {
      this.showMCPManager();
    });
  }

  setupChatScrolling() {
    /**
     * Sets up chat scrolling behavior and keyboard shortcuts.
     * Monitors scroll position and shows/hides scroll-to-bottom button.
     * 
     * @returns {void}
     */
    if (!this.chatMessages || !this.scrollToBottomBtn) {
      return;
    }

    this.chatMessages.addEventListener('scroll', () => {
      this.handleChatScroll();
    });

    document.addEventListener('keydown', (e) => {
      if (e.target === this.messageInput) return; // Don't interfere with input
      
      switch(e.key) {
      case 'PageUp':
        e.preventDefault();
        this.scrollChat(-200);
        break;
      case 'PageDown':
        e.preventDefault();
        this.scrollChat(200);
        break;
      case 'Home':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.scrollToTop();
        }
        break;
      case 'End':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.scrollToBottom();
        }
        break;
      }
    });

    this.handleChatScroll();
  }

  handleChatScroll() {
    /**
     * Handles chat scroll events and updates scroll-to-bottom button visibility.
     * Tracks whether user has scrolled up from the bottom.
     * 
     * @returns {void}
     */
    if (!this.chatMessages || !this.scrollToBottomBtn) return;
    
    const { scrollTop, scrollHeight, clientHeight } = this.chatMessages;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 50;
    
    this.isUserScrolledUp = !isNearBottom;
    
    if (this.isUserScrolledUp && scrollHeight > clientHeight) {
      this.scrollToBottomBtn.classList.remove('hidden');
    } else {
      this.scrollToBottomBtn.classList.add('hidden');
    }
  }

  scrollChat(delta) {
    /**
     * Scrolls the chat by a specified delta amount.
     * 
     * @param {number} delta - Amount to scroll (positive or negative).
     * @returns {void}
     */
    this.chatMessages.scrollTop += delta;
  }

  scrollToTop() {
    /**
     * Scrolls the chat to the top.
     * 
     * @returns {void}
     */
    this.chatMessages.scrollTop = 0;
  }

  setupSettingsModal() {
    /**
     * Sets up event listeners for the settings modal.
     * Handles close, save, cancel, tab switching, and slider updates.
     * 
     * @returns {void}
     */
    const closeBtn = document.getElementById('closeSettingsBtn');
    const saveBtn = document.getElementById('saveSettingsBtn');
    const cancelBtn = document.getElementById('cancelSettingsBtn');
    
    closeBtn.addEventListener('click', () => this.hideSettings());
    cancelBtn.addEventListener('click', () => this.hideSettings());
    saveBtn.addEventListener('click', () => this.saveSettings());
    
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });
    
    const stabilitySlider = document.getElementById('voiceStability');
    const stabilityValue = document.getElementById('stabilityValue');
    
    stabilitySlider?.addEventListener('input', () => {
      stabilityValue.textContent = stabilitySlider.value;
    });
  }

  setupMCPModal() {
    /**
     * Sets up event listeners for the MCP manager modal.
     * Handles close, add, and filter actions.
     * 
     * @returns {void}
     */
    const closeBtn = document.getElementById('closeMcpBtn');
    const addBtn = document.getElementById('addMcpBtn');
    const categoryFilter = document.getElementById('mcpCategoryFilter');
    
    closeBtn.addEventListener('click', () => this.hideMCPManager());
    addBtn.addEventListener('click', () => this.showAddMCPDialog());
    categoryFilter.addEventListener('change', () => this.filterMCPConnections());
  }

  async loadInitialData() {
    /**
     * Loads initial data including settings and MCP connections.
     * Retries up to 3 times if IPC handlers are not ready.
     * 
     * @async
     * @returns {Promise<void>}
     */
    try {
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          this.currentSettings = await ipcRenderer.invoke('get-settings');
          break;
        } catch (error) {
          attempts++;
          if (attempts === maxAttempts) {
            console.error('Failed to load settings after', maxAttempts, 'attempts:', error);
            this.currentSettings = {}; // Use empty settings as fallback
          } else {
            console.warn(`Settings load attempt ${attempts} failed, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }
      
      this.updateConnectionStatus();
      
      try {
        const result = await ipcRenderer.invoke('mcp-get-connections');
        if (result.success) {
          this.mcpConnections = result.connections;
          this.updateMCPCount();
        }
      } catch (error) {
        console.error('Error loading MCP connections:', error);
        this.mcpConnections = [];
        this.updateMCPCount();
      }
      
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  }

  showWelcomeMessage() {
    /**
     * Displays the welcome message with quick action buttons.
     * 
     * @returns {void}
     */
    const welcomeHtml = `
      <div class="welcome-message">
        <h2>👋 Welcome to Mai Buddy!</h2>
        <p>Your highly customizable AI assistant is ready to help.</p>
        <div class="quick-actions">
          <button class="quick-action" onclick="renderer.insertQuickMessage('What can you help me with?')">What can you do?</button>
          <button class="quick-action" onclick="renderer.insertQuickMessage('Show me my MCP connections')">MCP Status</button>
          <button class="quick-action" onclick="renderer.insertQuickMessage('Help me set up voice commands')">Voice Setup</button>
        </div>
      </div>
    `;
    
    this.chatMessages.innerHTML = welcomeHtml;
  }

  insertQuickMessage(message) {
    /**
     * Inserts a quick message into the input field and focuses it.
     * 
     * @param {string} message - The message to insert.
     * @returns {void}
     */
    this.messageInput.value = message;
    this.messageInput.focus();
  }

  async sendMessage() {
    /**
     * Sends a message to the AI service and displays the response.
     * Shows typing indicator during processing.
     * 
     * @async
     * @returns {Promise<void>}
     */
    const message = this.messageInput.value.trim();
    if (!message) return;
    
    this.addMessage('user', message);
    this.messageInput.value = '';
    this.autoResizeTextarea();
    
    this.showTypingIndicator();
    
    try {
      const response = await ipcRenderer.invoke('send-message', message);
      
      this.hideTypingIndicator();
      
      if (response.error) {
        this.addMessage('assistant', `I'm sorry, I encountered an error: ${response.error}`, true);
      } else {
        // Show tool execution status if applicable
        if (response.toolExecuted) {
          this.addToolExecutionMessage(response.toolResult);
        } else if (response.toolError) {
          this.addMessage('assistant', `I tried to execute a tool for you, but encountered an error: ${response.toolError}`, true);
        }
        
        this.addMessage('assistant', response.response);
      }
      
    } catch (error) {
      this.hideTypingIndicator();
      this.addMessage('assistant', 'I apologize, but I\'m having trouble processing your request. Please check your API settings.', true);
      console.error('Error sending message:', error);
    }
  }

  addToolExecutionMessage(toolResult) {
    /**
     * Adds a tool execution result message to the chat.
     * 
     * @param {Object} toolResult - The result of the tool execution.
     * @returns {void}
     */
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system tool-execution';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content tool-result';
    contentDiv.innerHTML = `
      <div class="tool-header">
        <span class="tool-icon">🔧</span>
        <span class="tool-label">Tool Executed</span>
      </div>
      <div class="tool-output">
        <pre>${JSON.stringify(toolResult, null, 2)}</pre>
      </div>
    `;
    
    const timestampDiv = document.createElement('div');
    timestampDiv.className = 'message-timestamp';
    timestampDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(timestampDiv);
    
    this.chatMessages.appendChild(messageDiv);
    this.scrollToBottom();
  }

  addMessage(role, content, isError = false) {
    /**
     * Adds a message to the chat display.
     * 
     * @param {string} role - The role (user/assistant/system).
     * @param {string} content - The message content.
     * @param {boolean} [isError=false] - Whether this is an error message.
     * @returns {void}
     */
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    if (isError) contentDiv.style.borderColor = 'var(--error-color)';
    contentDiv.textContent = content;
    
    const timestampDiv = document.createElement('div');
    timestampDiv.className = 'message-timestamp';
    timestampDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(timestampDiv);
    
    const welcomeMessage = this.chatMessages.querySelector('.welcome-message');
    if (welcomeMessage) {
      welcomeMessage.remove();
    }
    
    this.chatMessages.appendChild(messageDiv);
    
    if (!this.isUserScrolledUp) {
      this.scrollToBottom();
    }
    
    this.messages.push({ role, content, timestamp: new Date().toISOString() });
  }

  showTypingIndicator() {
    /**
     * Shows the typing indicator animation in the chat.
     * 
     * @returns {void}
     */
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant';
    typingDiv.id = 'typing-indicator';
    
    const indicatorDiv = document.createElement('div');
    indicatorDiv.className = 'typing-indicator';
    indicatorDiv.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    
    typingDiv.appendChild(indicatorDiv);
    this.chatMessages.appendChild(typingDiv);
    this.scrollToBottom();
  }

  hideTypingIndicator() {
    /**
     * Hides and removes the typing indicator from the chat.
     * 
     * @returns {void}
     */
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }

  scrollToBottom() {
    /**
     * Scrolls the chat to the bottom smoothly.
     * Resets user scroll state and updates scroll button visibility.
     * 
     * @returns {void}
     */
    if (!this.chatMessages) return;
    
    this.chatMessages.scrollTo({
      top: this.chatMessages.scrollHeight,
      behavior: 'smooth'
    });
    // Reset user scroll state when we programmatically scroll to bottom
    this.isUserScrolledUp = false;
    
    setTimeout(() => {
      this.handleChatScroll();
    }, 100);
  }

  autoResizeTextarea() {
    /**
     * Automatically resizes the message input textarea based on content.
     * Maximum height is 100px.
     * 
     * @returns {void}
     */
    this.messageInput.style.height = 'auto';
    this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 100) + 'px';
  }

  toggleVoiceMode() {
    /**
     * Toggles voice mode on/off and updates UI accordingly.
     * 
     * @returns {void}
     */
    this.isVoiceActive = !this.isVoiceActive;
    
    if (this.isVoiceActive) {
      this.voiceBtn.classList.add('active');
      this.statusText.textContent = 'Listening...';
    } else {
      this.voiceBtn.classList.remove('active');
      this.statusText.textContent = 'Connected';
    }
  }

  updateConnectionStatus() {
    /**
     * Updates the connection status indicator based on API key presence.
     * 
     * @returns {void}
     */
    const hasApiKey = this.currentSettings.openaiApiKey && this.currentSettings.openaiApiKey.length > 0;
    
    if (hasApiKey) {
      this.statusIndicator.className = 'status-indicator online';
      this.statusText.textContent = 'Connected';
    } else {
      this.statusIndicator.className = 'status-indicator offline';
      this.statusText.textContent = 'API Key Required';
    }
  }

  updateMCPCount() {
    /**
     * Updates the MCP connection count badge.
     * 
     * @returns {void}
     */
    const activeConnections = this.mcpConnections.filter(conn => conn.status === 'connected').length;
    this.mcpCount.textContent = activeConnections;
  }

  hideSettings() {
    /**
     * Hides the settings modal.
     * 
     * @returns {void}
     */
    this.settingsModal.classList.add('hidden');
  }

  loadSettingsIntoForm() {
    /**
     * Loads current settings into the settings form.
     * Populates all input fields, checkboxes, and sliders.
     * 
     * @returns {void}
     */
    // Load current settings into form
    document.getElementById('openaiApiKey').value = this.currentSettings.openaiApiKey || '';
    document.getElementById('elevenLabsApiKey').value = this.currentSettings.elevenLabsApiKey || '';
    document.getElementById('aiModel').value = this.currentSettings.aiModel || 'gpt-4';
    document.getElementById('systemPrompt').value = this.currentSettings.systemPrompt || '';
    
    // Load checkboxes
    document.getElementById('startOnBoot').checked = this.currentSettings.startOnBoot || false;
    document.getElementById('minimizeToTray').checked = this.currentSettings.minimizeToTray || false;
    document.getElementById('alwaysOnTop').checked = this.currentSettings.alwaysOnTop || false;
    
    // Load voice settings
    document.getElementById('voiceId').value = this.currentSettings.voiceId || 'Rachel';
    document.getElementById('voiceStability').value = this.currentSettings.voiceStability || 0.5;
    document.getElementById('stabilityValue').textContent = this.currentSettings.voiceStability || 0.5;
  }

  async saveSettings() {
    /**
     * Saves settings from the form to storage via IPC.
     * Updates connection status and closes the modal on success.
     * 
     * @async
     * @returns {Promise<void>}
     */
    const settings = {
      openaiApiKey: document.getElementById('openaiApiKey').value,
      elevenLabsApiKey: document.getElementById('elevenLabsApiKey').value,
      aiModel: document.getElementById('aiModel').value,
      systemPrompt: document.getElementById('systemPrompt').value,
      startOnBoot: document.getElementById('startOnBoot').checked,
      minimizeToTray: document.getElementById('minimizeToTray').checked,
      alwaysOnTop: document.getElementById('alwaysOnTop').checked,
      voiceId: document.getElementById('voiceId').value,
      voiceStability: parseFloat(document.getElementById('voiceStability').value)
    };
    
    try {
      await ipcRenderer.invoke('save-settings', settings);
      this.currentSettings = settings;
      this.updateConnectionStatus();
      this.hideSettings();
      
      this.addMessage('assistant', 'Settings saved successfully! 🎉');
      
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error saving settings. Please try again.');
    }
  }

  switchTab(tabName) {
    /**
     * Switches the active tab in the settings modal.
     * 
     * @param {string} tabName - The name of the tab to switch to.
     * @returns {void}
     */
    // Remove active class from all tabs and content
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Add active class to selected tab and content
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}Tab`).classList.add('active');
  }

  showSettings() {
    /**
     * Shows the settings modal and loads current settings.
     * 
     * @returns {void}
     */
    this.loadSettingsIntoForm();
    this.settingsModal.classList.remove('hidden');
  }

  showMCPManager() {
    /**
     * Shows the MCP manager modal and loads connections.
     * 
     * @returns {void}
     */
    this.loadMCPConnections();
    this.mcpModal.classList.remove('hidden');
  }

  hideMCPManager() {
    /**
     * Hides the MCP manager modal.
     * 
     * @returns {void}
     */
    this.mcpModal.classList.add('hidden');
  }

  async loadMCPConnections() {
    /**
     * Loads MCP connections from the main process and renders them.
     * 
     * @async
     * @returns {Promise<void>}
     */
    try {
      const result = await ipcRenderer.invoke('mcp-get-connections');
      if (result.success) {
        this.mcpConnections = result.connections;
        this.mcpStats = result.stats;
        this.updateMCPStatus();
        this.renderMCPConnections();
      } else {
        console.error('Error loading MCP connections:', result.error);
      }
    } catch (error) {
      console.error('Error loading MCP connections:', error);
    }
  }

  updateMCPStatus() {
    /**
     * Updates the MCP status indicator and count badge.
     * 
     * @returns {void}
     */
    if (this.mcpStats) {
      this.mcpCount.textContent = this.mcpStats.connected;
      
      // Update MCP button appearance based on status
      if (this.mcpStats.connected > 0) {
        this.mcpBtn.classList.add('active');
        this.mcpBtn.title = `${this.mcpStats.connected} MCP connections active`;
      } else {
        this.mcpBtn.classList.remove('active');
        this.mcpBtn.title = 'No MCP connections active';
      }
    }
  }

  renderMCPConnections() {
    /**
     * Renders MCP connections grouped by category.
     * Shows empty state if no connections exist.
     * 
     * @returns {void}
     */
    const container = document.getElementById('mcpConnectionsList');
    
    if (!container) {
      console.warn('MCP connections list container not found');
      return;
    }
    
    if (this.mcpConnections.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔌</div>
          <h3>No MCP connections</h3>
          <p>Connect to external services and tools to extend Mai Buddy's capabilities.</p>
          <button class="btn btn-primary" onclick="renderer.showAddMCPConnection()">
            Add Your First Connection
          </button>
        </div>
      `;
      return;
    }
    
    // Group connections by category
    const groupedConnections = this.mcpConnections.reduce((groups, conn) => {
      const category = conn.category || 'Other';
      if (!groups[category]) groups[category] = [];
      groups[category].push(conn);
      return groups;
    }, {});
    
    container.innerHTML = Object.entries(groupedConnections).map(([category, connections]) => `
      <div class="mcp-category">
        <h3 class="mcp-category-title">${category}</h3>
        <div class="mcp-connections-grid">
          ${connections.map(conn => `
            <div class="mcp-connection-card ${conn.status}">
              <div class="mcp-connection-header">
                <div class="mcp-connection-info">
                  <h4>${conn.name}</h4>
                  <p>${conn.description}</p>
                  ${conn.capabilities ? `
                    <div class="mcp-capabilities">
                      ${conn.capabilities.slice(0, 3).map(cap => `
                        <span class="capability-tag">${cap}</span>
                      `).join('')}
                      ${(() => {
    return conn.capabilities.length > 3 ? `<span class="capability-more">+${conn.capabilities.length - 3}</span>` : '';
  })()}
                    </div>
                  ` : ''}
                </div>
                <div class="mcp-connection-status">
                  <div class="status-indicator ${conn.status}" title="${conn.status}"></div>
                  ${conn.lastConnected ? `<small>${new Date(conn.lastConnected).toLocaleString()}</small>` : ''}
                </div>
              </div>
              <div class="mcp-connection-actions">
                <button class="btn btn-sm" onclick="renderer.testMCPConnection('${conn.id}', this)" title="Test connection">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M11,16.5L6.5,12L7.91,10.59L11,13.67L16.59,8.09L18,9.5L11,16.5Z"/>
                  </svg>
                  Test
                </button>
                <button class="btn btn-sm" onclick="renderer.showMCPTools('${conn.id}')" title="View available tools">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.7,19L13.6,9.9C14.5,7.6 14,4.9 12.1,3C10.1,1 7.1,0.6 4.7,1.7L9,6L6,9L1.6,4.7C0.4,7.1 0.9,10.1 2.9,12.1C4.8,14 7.5,14.5 9.8,13.6L18.9,22.7C19.3,23.1 19.9,23.1 20.3,22.7L22.7,20.3C23.1,19.9 23.1,19.3 22.7,19Z"/>
                  </svg>
                  Tools
                </button>
                <button class="btn btn-sm btn-danger" onclick="renderer.removeMCPConnection('${conn.id}')" title="Remove connection">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/>
                  </svg>
                  Remove
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  async showAddMCPConnection() {
    /**
     * Shows a modal dialog for adding a new MCP connection.
     * Creates and displays a form with connection configuration options.
     * 
     * @async
     * @returns {Promise<void>}
     */
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Add MCP Connection</h2>
          <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
        </div>
        <div class="modal-body">
          <form id="addMcpForm">
            <div class="form-group">
              <label for="mcpName">Connection Name</label>
              <input type="text" id="mcpName" required placeholder="e.g., File System Tools">
            </div>
            
            <div class="form-group">
              <label for="mcpType">Connection Type</label>
              <select id="mcpType" required>
                <option value="">Select connection type</option>
                <option value="stdio">Standard I/O</option>
                <option value="sse">Server-Sent Events</option>
                <option value="websocket">WebSocket</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="mcpCommand">Command/Executable Path</label>
              <input type="text" id="mcpCommand" required placeholder="e.g., node /path/to/mcp-server.js">
            </div>
            
            <div class="form-group">
              <label for="mcpArgs">Arguments (optional)</label>
              <input type="text" id="mcpArgs" placeholder="--config config.json">
            </div>
            
            <div class="form-group">
              <label for="mcpCategory">Category</label>
              <select id="mcpCategory">
                <option value="Development">Development</option>
                <option value="File System">File System</option>
                <option value="Database">Database</option>
                <option value="API">API</option>
                <option value="Other">Other</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="mcpDescription">Description</label>
              <textarea id="mcpDescription" placeholder="Brief description of what this connection provides"></textarea>
            </div>
            
            <div class="form-group checkbox-group">
              <label>
                <input type="checkbox" id="mcpAutoStart" checked>
                Auto-start with application
              </label>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
          <button class="btn btn-primary" onclick="renderer.addMCPConnection()">Add Connection</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    modal.classList.remove('hidden');
  }

  async addMCPConnection() {
    /**
     * Adds a new MCP connection from the form data.
     * Validates required fields and sends request to main process.
     * 
     * @async
     * @returns {Promise<void>}
     */
    const form = document.getElementById('addMcpForm');
    const formData = new FormData(form);
    
    const connectionData = {
      name: formData.get('mcpName').trim(),
      type: formData.get('mcpType'),
      command: formData.get('mcpCommand').trim(),
      args: formData.get('mcpArgs').trim().split(' ').filter(Boolean),
      category: formData.get('mcpCategory'),
      description: formData.get('mcpDescription').trim(),
      autoStart: formData.get('mcpAutoStart').checked
    };
    
    // Validate required fields
    if (!connectionData.name || !connectionData.type || !connectionData.command) {
      this.showNotification('Please fill in all required fields', 'error');
      return;
    }
    
    try {
      const result = await ipcRenderer.invoke('mcp-add-connection', connectionData);
      
      if (result.success) {
        this.showNotification('MCP connection added successfully!', 'success');
        document.querySelector('.modal').remove();
        await this.loadMCPConnections();
      } else {
        this.showNotification(`Failed to add connection: ${result.error}`, 'error');
      }
      
    } catch (error) {
      console.error('Error adding MCP connection:', error);
      this.showNotification('Failed to add connection', 'error');
    }
  }

  async testMCPConnection(connectionId, buttonElement) {
    /**
     * Tests an MCP connection and shows result notification.
     * Updates button state during testing.
     * 
     * @async
     * @param {string} connectionId - The ID of the connection to test.
     * @param {HTMLElement} buttonElement - The button element that triggered the test.
     * @returns {Promise<void>}
     */
    try {
      const button = buttonElement || document.querySelector(`[onclick*="${connectionId}"]`);
      button.dataset.originalText = button.innerHTML;
      button.innerHTML = '<span class="spinner"></span> Testing...';
      button.disabled = true;

      const result = await ipcRenderer.invoke('mcp-test-connection', connectionId);
      
      if (result.success && result.result.success) {
        this.showNotification('Connection test successful!', 'success');
      } else {
        this.showNotification(`Connection test failed: ${result.result?.message || result.error}`, 'error');
      }

      await this.loadMCPConnections();

    } catch (error) {
      console.error('Error testing MCP connection:', error);
      this.showNotification('Connection test failed', 'error');
    } finally {
      const button = buttonElement || document.querySelector(`[onclick*="${connectionId}"]`);
      button.innerHTML = button.dataset.originalText;
      button.disabled = false;
    }
  }

  async showMCPTools(connectionId) {
    /**
     * Shows available tools for an MCP connection in a modal dialog.
     * 
     * @async
     * @param {string} connectionId - The ID of the connection.
     * @returns {Promise<void>}
     */
    try {
      const result = await ipcRenderer.invoke('mcp-get-tools', connectionId);
      
      if (result.success) {
        const connection = this.mcpConnections.find(c => c.id === connectionId);
        const tools = result.tools;

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
          <div class="modal-content">
            <div class="modal-header">
              <h2>Available Tools - ${connection?.name}</h2>
              <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
            </div>
            <div class="modal-body">
              ${tools.length === 0 ? `
                <div class="empty-state">
                  <p>No tools available for this connection.</p>
                </div>
              ` : `
                <div class="tools-list">
                  ${tools.map(tool => `
                    <div class="tool-card">
                      <h4>${tool.name}</h4>
                      <p>${tool.description}</p>
                      ${tool.parameters ? `
                        <details>
                          <summary>Parameters</summary>
                          <pre class="tool-parameters">${JSON.stringify(tool.parameters, null, 2)}</pre>
                        </details>
                      ` : ''}
                      <button class="btn btn-sm" onclick="renderer.executeMCPTool('${connectionId}', '${tool.name}')">
                        Execute Tool
                      </button>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
          </div>
        `;

        document.body.appendChild(modal);
        modal.classList.remove('hidden');

      } else {
        this.showNotification(`Failed to load tools: ${result.error}`, 'error');
      }

    } catch (error) {
      console.error('Error loading MCP tools:', error);
      this.showNotification('Failed to load tools', 'error');
    }
  }

  async executeMCPTool(connectionId, toolName) {
    /**
     * Executes an MCP tool with provided parameters.
     * Prompts user for parameters for common tools.
     * 
     * @async
     * @param {string} connectionId - The ID of the connection.
     * @param {string} toolName - The name of the tool to execute.
     * @returns {Promise<void>}
     */
    // Simple tool execution - in a real implementation, you'd want a form for parameters
    const parameters = {};
    
    // For demo purposes, provide some default parameters for common tools
    if (toolName === 'list_directory') {
      parameters.path = prompt('Enter directory path:', process.cwd() || '/');
      if (!parameters.path) return;
    } else if (toolName === 'execute_command') {
      parameters.command = prompt('Enter command to execute:', 'echo "Hello from MCP!"');
      if (!parameters.command) return;
    } else if (toolName === 'read_file') {
      parameters.path = prompt('Enter file path:');
      if (!parameters.path) return;
    }

    try {
      const result = await ipcRenderer.invoke('mcp-execute-tool', connectionId, toolName, parameters);
      
      if (result.success) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
          <div class="modal-content">
            <div class="modal-header">
              <h2>Tool Result - ${toolName}</h2>
              <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
            </div>
            <div class="modal-body">
              <pre class="tool-result">${JSON.stringify(result.result, null, 2)}</pre>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        modal.classList.remove('hidden');

      } else {
        this.showNotification(`Tool execution failed: ${result.error}`, 'error');
      }

    } catch (error) {
      console.error('Error executing MCP tool:', error);
      this.showNotification('Tool execution failed', 'error');
    }
  }

  async removeMCPConnection(connectionId) {
    /**
     * Removes an MCP connection after user confirmation.
     * 
     * @async
     * @param {string} connectionId - The ID of the connection to remove.
     * @returns {Promise<void>}
     */
    if (!confirm('Are you sure you want to remove this MCP connection?')) {
      return;
    }

    try {
      const result = await ipcRenderer.invoke('mcp-remove-connection', connectionId);
      
      if (result.success) {
        this.showNotification('Connection removed successfully', 'success');
        await this.loadMCPConnections();
      } else {
        this.showNotification(`Failed to remove connection: ${result.error}`, 'error');
      }

    } catch (error) {
      console.error('Error removing MCP connection:', error);
      this.showNotification('Failed to remove connection', 'error');
    }
  }

  showNotification(message, type = 'info') {
    /**
     * Shows a temporary notification message.
     * Auto-removes after 3 seconds.
     * 
     * @param {string} message - The notification message.
     * @param {string} [type='info'] - The notification type (info/error/success).
     * @returns {void}
     */
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  // MCP methods consolidated

  showAddMCPDialog() {
    /**
     * Shows dialog for adding MCP connections.
     * Placeholder for future implementation.
     * 
     * @returns {void}
     */
    // This would open a dialog to add new MCP connections
    alert('Add MCP Connection feature coming soon!');
  }

  editMCPConnection() {
    /**
     * Shows dialog for editing MCP connections.
     * Placeholder for future implementation.
     * 
     * @returns {void}
     */
    // This would open a dialog to edit MCP connections
    alert('Edit MCP Connection feature coming soon!');
  }

  filterMCPConnections() {
    /**
     * Filters displayed MCP connections by selected criteria.
     * Placeholder for future implementation.
     * 
     * @returns {void}
     */
    // This would filter the displayed connections
    console.log('Filtering MCP connections...');
  }

  hideWindow() {
    /**
     * Hides the application window via IPC to main process.
     * 
     * @returns {void}
     */
    // This would be handled by the main process
    ipcRenderer.invoke('hide-window');
  }

  quitApp() {
    /**
     * Quits the application via IPC to main process.
     * 
     * @returns {void}
     */
    ipcRenderer.invoke('quit-app');
  }
}

// Initialize the renderer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.renderer = new MaiBuddyRenderer();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!document.querySelector('.modal.hidden')) {
      document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.add('hidden');
      });
    } else {
      ipcRenderer.invoke('hide-window');
    }
  }
});
