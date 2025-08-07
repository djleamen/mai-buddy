const { ipcRenderer } = require('electron');

class MaiBuddyRenderer {
  constructor() {
    this.isVoiceActive = false;
    this.currentSettings = {};
    this.mcpConnections = [];
    this.messages = [];
    this.isUserScrolledUp = false; // Initialize scroll state
    
    this.initializeElements();
    this.setupEventListeners();
    this.showWelcomeMessage();
    
    // Delay initial data loading to ensure IPC handlers are ready
    setTimeout(() => {
      this.loadInitialData();
    }, 500);
  }

  initializeElements() {
    // Title bar elements
    this.settingsBtn = document.getElementById('settingsBtn');
    this.minimizeBtn = document.getElementById('minimizeBtn');
    
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
    // Title bar buttons
    this.settingsBtn.addEventListener('click', () => this.showSettings());
    this.minimizeBtn.addEventListener('click', () => this.hideWindow());
    
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
    
    // Chat scrolling enhancements
    this.setupChatScrolling();
    
    // Settings modal
    this.setupSettingsModal();
    
    // MCP modal
    this.setupMCPModal();
    
    // Auto-resize textarea
    this.autoResizeTextarea();
  }

  setupChatScrolling() {
    // Ensure elements exist
    if (!this.chatMessages || !this.scrollToBottomBtn) {
      return;
    }

    // Add scroll event listener for better scroll behavior
    this.chatMessages.addEventListener('scroll', () => {
      this.handleChatScroll();
    });

    // Add keyboard navigation for chat
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

    // Initial scroll state check
    this.handleChatScroll();
  }

  handleChatScroll() {
    if (!this.chatMessages || !this.scrollToBottomBtn) return;
    
    const { scrollTop, scrollHeight, clientHeight } = this.chatMessages;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 50;
    
    // Store scroll position for auto-scroll decisions
    this.isUserScrolledUp = !isNearBottom;
    
    // Show/hide scroll to bottom button
    if (this.isUserScrolledUp && scrollHeight > clientHeight) {
      this.scrollToBottomBtn.classList.remove('hidden');
    } else {
      this.scrollToBottomBtn.classList.add('hidden');
    }
  }

  scrollChat(delta) {
    this.chatMessages.scrollTop += delta;
  }

  scrollToTop() {
    this.chatMessages.scrollTop = 0;
  }

  setupSettingsModal() {
    const closeBtn = document.getElementById('closeSettingsBtn');
    const saveBtn = document.getElementById('saveSettingsBtn');
    const cancelBtn = document.getElementById('cancelSettingsBtn');
    
    closeBtn.addEventListener('click', () => this.hideSettings());
    cancelBtn.addEventListener('click', () => this.hideSettings());
    saveBtn.addEventListener('click', () => this.saveSettings());
    
    // Tab switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });
    
    // Range input updates
    const stabilitySlider = document.getElementById('voiceStability');
    const stabilityValue = document.getElementById('stabilityValue');
    
    stabilitySlider?.addEventListener('input', () => {
      stabilityValue.textContent = stabilitySlider.value;
    });
  }

  setupMCPModal() {
    const closeBtn = document.getElementById('closeMcpBtn');
    const addBtn = document.getElementById('addMcpBtn');
    const categoryFilter = document.getElementById('mcpCategoryFilter');
    
    closeBtn.addEventListener('click', () => this.hideMCPManager());
    addBtn.addEventListener('click', () => this.showAddMCPDialog());
    categoryFilter.addEventListener('change', () => this.filterMCPConnections());
  }

  async loadInitialData() {
    try {
      // Load settings with retry logic
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
      
      // Load MCP connections
      try {
        this.mcpConnections = await ipcRenderer.invoke('get-mcp-connections');
        this.updateMCPCount();
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
    const welcomeHtml = `
      <div class="welcome-message">
        <h2>👋 Welcome to Mai Buddy!</h2>
        <p>Your highly customizable AI assistant is ready to help.</p>
        <div class="quick-actions">
          <button class="quick-action" onclick="renderer.insertQuickMessage('What can you help me with?')">What can you do?</button>
          <button class="quick-action" onclick="renderer.insertQuickMessage('Show me my MCP connections')">MCP Status</button>
          <button class="quick-action" onclick="renderer.insertQuickMessage('Help me set up voice commands')">Voice Setup</button>
          <button class="quick-action" onclick="renderer.showSettings()">Settings</button>
        </div>
      </div>
    `;
    
    this.chatMessages.innerHTML = welcomeHtml;
  }

  insertQuickMessage(message) {
    this.messageInput.value = message;
    this.messageInput.focus();
  }

  async sendMessage() {
    const message = this.messageInput.value.trim();
    if (!message) return;
    
    // Add user message to chat
    this.addMessage('user', message);
    this.messageInput.value = '';
    this.autoResizeTextarea();
    
    // Show typing indicator
    this.showTypingIndicator();
    
    try {
      // Send message to main process
      const response = await ipcRenderer.invoke('send-message', message);
      
      // Remove typing indicator
      this.hideTypingIndicator();
      
      if (response.error) {
        this.addMessage('assistant', `I'm sorry, I encountered an error: ${response.error}`, true);
      } else {
        this.addMessage('assistant', response.response);
      }
      
    } catch (error) {
      this.hideTypingIndicator();
      this.addMessage('assistant', 'I apologize, but I\'m having trouble processing your request. Please check your API settings.', true);
      console.error('Error sending message:', error);
    }
  }

  addMessage(role, content, isError = false) {
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
    
    // Remove welcome message if it exists
    const welcomeMessage = this.chatMessages.querySelector('.welcome-message');
    if (welcomeMessage) {
      welcomeMessage.remove();
    }
    
    this.chatMessages.appendChild(messageDiv);
    
    // Smart scroll behavior - only auto-scroll if user hasn't manually scrolled up
    if (!this.isUserScrolledUp) {
      this.scrollToBottom();
    }
    
    // Store message
    this.messages.push({ role, content, timestamp: new Date().toISOString() });
  }

  showTypingIndicator() {
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
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }

  scrollToBottom() {
    if (!this.chatMessages) return;
    
    this.chatMessages.scrollTo({
      top: this.chatMessages.scrollHeight,
      behavior: 'smooth'
    });
    // Reset user scroll state when we programmatically scroll to bottom
    this.isUserScrolledUp = false;
    
    // Update button visibility after scroll
    setTimeout(() => {
      this.handleChatScroll();
    }, 100);
  }

  autoResizeTextarea() {
    this.messageInput.style.height = 'auto';
    this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 100) + 'px';
  }

  toggleVoiceMode() {
    this.isVoiceActive = !this.isVoiceActive;
    
    if (this.isVoiceActive) {
      this.voiceBtn.classList.add('active');
      this.statusText.textContent = 'Listening...';
      // Here you would start voice recognition
    } else {
      this.voiceBtn.classList.remove('active');
      this.statusText.textContent = 'Connected';
    }
  }

  updateConnectionStatus() {
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
    const activeConnections = this.mcpConnections.filter(conn => conn.status === 'connected').length;
    this.mcpCount.textContent = activeConnections;
  }

  showSettings() {
    this.loadSettingsIntoForm();
    this.settingsModal.classList.remove('hidden');
  }

  hideSettings() {
    this.settingsModal.classList.add('hidden');
  }

  loadSettingsIntoForm() {
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
      
      // Show success message
      this.addMessage('assistant', 'Settings saved successfully! 🎉');
      
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error saving settings. Please try again.');
    }
  }

  switchTab(tabName) {
    // Remove active class from all tabs and content
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Add active class to selected tab and content
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}Tab`).classList.add('active');
  }

  showMCPManager() {
    this.loadMCPConnections();
    this.mcpModal.classList.remove('hidden');
  }

  hideMCPManager() {
    this.mcpModal.classList.add('hidden');
  }

  async loadMCPConnections() {
    try {
      this.mcpConnections = await ipcRenderer.invoke('get-mcp-connections');
      this.renderMCPConnections();
    } catch (error) {
      console.error('Error loading MCP connections:', error);
    }
  }

  renderMCPConnections() {
    const container = document.getElementById('mcpConnectionsList');
    
    if (this.mcpConnections.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
          <p>No MCP connections configured yet.</p>
          <p>Click "Add Connection" to get started!</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = this.mcpConnections.map(conn => `
      <div class="mcp-connection-card">
        <div class="mcp-connection-header">
          <div class="mcp-connection-info">
            <h4>${conn.name}</h4>
            <p>${conn.description}</p>
          </div>
          <div class="mcp-connection-status">
            <div class="status-indicator ${conn.status}"></div>
            <span>${conn.status}</span>
          </div>
        </div>
        <div class="mcp-connection-actions">
          <button onclick="renderer.testMCPConnection('${conn.id}')">Test</button>
          <button onclick="renderer.editMCPConnection('${conn.id}')">Edit</button>
          <button onclick="renderer.removeMCPConnection('${conn.id}')">Remove</button>
        </div>
      </div>
    `).join('');
  }

  async testMCPConnection(connectionId) {
    try {
      const result = await ipcRenderer.invoke('test-mcp-connection', connectionId);
      alert(result.success ? 'Connection successful!' : `Connection failed: ${result.message}`);
      this.loadMCPConnections(); // Refresh the list
    } catch (error) {
      alert('Error testing connection: ' + error.message);
    }
  }

  async removeMCPConnection(connectionId) {
    if (confirm('Are you sure you want to remove this connection?')) {
      try {
        await ipcRenderer.invoke('remove-mcp-connection', connectionId);
        this.loadMCPConnections(); // Refresh the list
        this.updateMCPCount();
      } catch (error) {
        alert('Error removing connection: ' + error.message);
      }
    }
  }

  showAddMCPDialog() {
    // This would open a dialog to add new MCP connections
    alert('Add MCP Connection feature coming soon!');
  }

  editMCPConnection(connectionId) {
    // This would open a dialog to edit MCP connections
    alert('Edit MCP Connection feature coming soon!');
  }

  filterMCPConnections() {
    // This would filter the displayed connections
    console.log('Filtering MCP connections...');
  }

  hideWindow() {
    // This would be handled by the main process
    ipcRenderer.invoke('hide-window');
  }
}

// Initialize the renderer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.renderer = new MaiBuddyRenderer();
});

// Handle keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Hide modals or window
    if (!document.querySelector('.modal.hidden')) {
      document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.add('hidden');
      });
    } else {
      ipcRenderer.invoke('hide-window');
    }
  }
});
