const { ipcRenderer } = window;

if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function') {
  // eslint-disable-next-line no-console
  console.error('[renderer] Preload bridge missing: window.ipcRenderer is not available.');
  window.addEventListener('DOMContentLoaded', () => {
    const status = document.querySelector('#connectionStatus .status-text');
    if (status) status.textContent = 'Preload failed — check DevTools';
    const indicator = document.querySelector('#connectionStatus .status-indicator');
    if (indicator) indicator.style.background = '#e53935';
  });
}

class MaiBuddyRenderer {
  constructor() {
    this.isVoiceActive = false;
    this.currentSettings = {};
    this.mcpConnections = [];
    this.messages = [];
    this.isUserScrolledUp = false;
    
    this.initializeElements();
    this.setupEventListeners();
    this.showWelcomeMessage();
    
    setTimeout(() => {
      this.loadInitialData();
    }, 500);
  }

  initializeElements() {
    this.settingsBtn = document.getElementById('settingsBtn');
    this.minimizeBtn = document.getElementById('minimizeBtn');
    this.quitBtn = document.getElementById('quitBtn');
    
    this.connectionStatus = document.getElementById('connectionStatus');
    this.statusIndicator = this.connectionStatus.querySelector('.status-indicator');
    this.statusText = this.connectionStatus.querySelector('.status-text');
    this.mcpBtn = document.getElementById('mcpBtn');
    this.mcpCount = document.getElementById('mcpCount');
    
    this.chatMessages = document.getElementById('chatMessages');
    this.messageInput = document.getElementById('messageInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.voiceBtn = document.getElementById('voiceBtn');
    this.scrollToBottomBtn = document.getElementById('scrollToBottomBtn');
    
    this.settingsModal = document.getElementById('settingsModal');
    this.mcpModal = document.getElementById('mcpModal');
  }

  setupEventListeners() {
    this.settingsBtn.addEventListener('click', () => this.showSettings());
    this.minimizeBtn.addEventListener('click', () => this.hideWindow());
    this.quitBtn.addEventListener('click', () => this.quitApp());
    
    this.mcpBtn.addEventListener('click', () => this.showMCPManager());
    
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
    
    this.scrollToBottomBtn.addEventListener('click', () => this.scrollToBottom());
    
    this.setupChatScrolling();
    
    this.setupSettingsModal();
    
    this.setupMCPModal();
    
    this.autoResizeTextarea();
    
    this.setupIPCListeners();
  }
  
  setupIPCListeners() {
    if (!ipcRenderer || typeof ipcRenderer.on !== 'function') {
      console.error('[renderer] Cannot register IPC listeners — bridge missing.');
      return;
    }
    ipcRenderer.on('show-settings', () => {
      this.showSettings();
    });
    
    ipcRenderer.on('show-mcp-manager', () => {
      this.showMCPManager();
    });
  }

  setupChatScrolling() {
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
    const closeBtn = document.getElementById('closeMcpBtn');
    const addBtn = document.getElementById('addMcpBtn');
    const categoryFilter = document.getElementById('mcpCategoryFilter');
    
    closeBtn.addEventListener('click', () => this.hideMCPManager());
    addBtn.addEventListener('click', () => this.showAddMCPDialog());
    categoryFilter.addEventListener('change', () => this.filterMCPConnections());
  }

  async loadInitialData() {
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
    const welcomeHtml = `
      <div class="welcome-message">
        <h2>Welcome to Mai Buddy</h2>
        <p>Your customizable AI assistant is ready to help.</p>
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
    this.messageInput.value = message;
    this.messageInput.focus();
  }

  async sendMessage() {
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
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    if (isError) contentDiv.style.borderColor = 'var(--error-color)';
    if (role === 'assistant' && !isError && typeof marked !== 'undefined') {
      try {
        const html = marked.parse(content, { gfm: true, breaks: true });
        contentDiv.innerHTML = (typeof DOMPurify !== 'undefined')
          ? DOMPurify.sanitize(html)
          : html;
        contentDiv.classList.add('markdown');
      } catch (_) {
        contentDiv.textContent = content;
      }
    } else {
      contentDiv.textContent = content;
    }
    
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
    this.isUserScrolledUp = false;
    
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
    } else {
      this.voiceBtn.classList.remove('active');
      this.statusText.textContent = 'Connected';
    }
  }

  updateConnectionStatus() {
    const hasApiKey = this.currentSettings.apiKey && this.currentSettings.apiKey.length > 0;
    
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

  hideSettings() {
    this.settingsModal.classList.add('hidden');
  }

  loadSettingsIntoForm() {
    document.getElementById('anthropicApiKey').value = this.currentSettings.anthropicApiKey || '';
    document.getElementById('elevenLabsApiKey').value = this.currentSettings.elevenLabsApiKey || '';
    document.getElementById('aiModel').value = this.currentSettings.aiModel || 'claude-sonnet-4-5';
    document.getElementById('systemPrompt').value = this.currentSettings.systemPrompt || '';
    
    document.getElementById('startOnBoot').checked = this.currentSettings.startOnBoot || false;
    document.getElementById('minimizeToTray').checked = this.currentSettings.minimizeToTray || false;
    document.getElementById('alwaysOnTop').checked = this.currentSettings.alwaysOnTop || false;
    
    document.getElementById('voiceId').value = this.currentSettings.voiceId || 'Rachel';
    document.getElementById('voiceStability').value = this.currentSettings.voiceStability || 0.5;
    document.getElementById('stabilityValue').textContent = this.currentSettings.voiceStability || 0.5;
  }

  async saveSettings() {
    const settings = {
      anthropicApiKey: document.getElementById('anthropicApiKey').value,
      elevenLabsApiKey: document.getElementById('elevenLabsApiKey').value,
      aiModel: document.getElementById('aiModel').value,
      systemPrompt: document.getElementById('systemPrompt').value,
      startOnBoot: document.getElementById('startOnBoot').checked,
      minimizeToTray: document.getElementById('minimizeToTray').checked,
      alwaysOnTop: document.getElementById('alwaysOnTop').checked,
      voiceId: document.getElementById('voiceId').value,
      voiceStability: Number.parseFloat(document.getElementById('voiceStability').value)
    };
    
    try {
      await ipcRenderer.invoke('save-settings', settings);
      // Re-fetch from backend so we pick up server-side mirrors
      try {
        this.currentSettings = await ipcRenderer.invoke('get-settings');
      } catch {
        this.currentSettings = settings;
      }
      this.updateConnectionStatus();
      this.hideSettings();
      
      this.addMessage('assistant', 'Settings saved successfully! 🎉');
      
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error saving settings. Please try again.');
    }
  }

  switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}Tab`).classList.add('active');
  }

  showSettings() {
    this.loadSettingsIntoForm();
    this.settingsModal.classList.remove('hidden');
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
    if (this.mcpStats) {
      this.mcpCount.textContent = this.mcpStats.connected;
      
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
                ${conn.requiresConfig ? `
                  <button class="btn btn-sm" onclick="renderer.configureMCPConnection('${conn.id}')" title="Configure">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z"/>
                    </svg>
                    Configure
                  </button>
                ` : ''}
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
    let types = [];
    try {
      const res = await ipcRenderer.invoke('mcp-get-available-types');
      if (res.success) types = res.types || [];
    } catch (err) {
      console.error('Failed to load available MCP types:', err);
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Add MCP Connection</h2>
          <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="mcpTypePicker">Connection</label>
            <select id="mcpTypePicker">
              <option value="">Select a connection&hellip;</option>
              ${types.map(t => `
                <option value="${this.escapeHtml(t.type)}">${this.escapeHtml(t.name)}${t.category ? ` &middot; ${this.escapeHtml(t.category)}` : ''}</option>
              `).join('')}
            </select>
            <small class="form-help" id="mcpTypeHelp"></small>
          </div>
          <div id="mcpDynamicFields"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
          <button class="btn btn-primary" id="mcpSaveBtn" disabled onclick="renderer.saveMCPConnectionConfig(this)">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.classList.remove('hidden');

    const picker = modal.querySelector('#mcpTypePicker');
    const help = modal.querySelector('#mcpTypeHelp');
    const typeMap = Object.fromEntries(types.map(t => [t.type, t]));
    picker.addEventListener('change', () => {
      const t = typeMap[picker.value];
      help.textContent = t && t.description ? t.description : '';
      this.renderMCPDynamicFields(picker.value, modal);
    });
  }

  async configureMCPConnection(connectionId) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Configure ${connectionId.charAt(0).toUpperCase() + connectionId.slice(1)}</h2>
          <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="mcpTypePicker" value="${connectionId}">
          <div id="mcpDynamicFields"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
          <button class="btn btn-primary" id="mcpSaveBtn" disabled onclick="renderer.saveMCPConnectionConfig(this)">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.classList.remove('hidden');
    this.renderMCPDynamicFields(connectionId, modal);
  }

  async renderMCPDynamicFields(type, modal) {
    const container = modal.querySelector('#mcpDynamicFields');
    const saveBtn = modal.querySelector('#mcpSaveBtn');
    if (!container || !saveBtn) return;

    if (!type) {
      container.innerHTML = '';
      saveBtn.disabled = true;
      return;
    }

    let schema = { fields: [], requiresConfig: false, configured: true };
    try {
      const res = await ipcRenderer.invoke('mcp-get-connection-schema', type);
      if (res.success) schema = res.schema;
    } catch (err) {
      console.error('Failed to load connection schema:', err);
    }

    if (!schema.requiresConfig) {
      container.innerHTML = `
        <div class="form-help" style="padding:12px;border:1px solid var(--border-color, #333);border-radius:6px;">
          No configuration required. Click Save to enable this connection.
        </div>
      `;
      saveBtn.disabled = false;
      return;
    }

    container.innerHTML = schema.fields.map(field => {
      const placeholder = field.secret && field.hasValue
        ? '\u2022\u2022\u2022\u2022\u2022\u2022 (leave blank to keep existing)'
        : (field.placeholder || '');
      const inputType = field.type === 'password' ? 'password' : (field.type || 'text');
      const value = field.secret ? '' : (field.value || '');
      const safeKey = this.escapeHtml(field.key);
      return `
        <div class="form-group">
          <label for="mcp-field-${safeKey}">${this.escapeHtml(field.label)}${field.secret && field.hasValue ? ' <span class="badge-configured">configured</span>' : ''}</label>
          <input id="mcp-field-${safeKey}" data-field-key="${safeKey}" data-secret="${field.secret ? '1' : '0'}" type="${inputType}" placeholder="${this.escapeHtml(placeholder)}" value="${this.escapeHtml(value)}" autocomplete="off" spellcheck="false">
          ${field.help ? `<small class="form-help">${this.escapeHtml(field.help)}</small>` : ''}
        </div>
      `;
    }).join('');
    saveBtn.disabled = false;
  }

  async saveMCPConnectionConfig(buttonEl) {
    const modal = buttonEl.closest('.modal');
    if (!modal) return;
    const type = modal.querySelector('#mcpTypePicker')?.value;
    if (!type) {
      this.showNotification('Pick a connection type first', 'error');
      return;
    }
    const inputs = modal.querySelectorAll('[data-field-key]');
    const values = {};
    inputs.forEach(input => {
      const key = input.getAttribute('data-field-key');
      const isSecret = input.getAttribute('data-secret') === '1';
      const v = input.value;
      // For secrets, blank means "keep existing"; only send non-empty values.
      if (isSecret && !v) return;
      values[key] = v;
    });

    buttonEl.disabled = true;
    try {
      const result = await ipcRenderer.invoke('mcp-save-connection-config', type, values);
      if (result.success) {
        this.showNotification('Connection saved', 'success');
        modal.remove();
        await this.loadMCPConnections();
      } else {
        this.showNotification(`Failed to save: ${result.error || 'unknown error'}`, 'error');
        buttonEl.disabled = false;
      }
    } catch (err) {
      console.error('Error saving MCP connection config:', err);
      this.showNotification('Failed to save connection', 'error');
      buttonEl.disabled = false;
    }
  }

  async testMCPConnection(connectionId, buttonElement) {
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
    const parameters = {};
    
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

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML.replaceAll('"', '&quot;');
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  showAddMCPDialog() {
    alert('Add MCP Connection feature coming soon!');
  }

  editMCPConnection() {
    alert('Edit MCP Connection feature coming soon!');
  }

  filterMCPConnections() {
    console.log('Filtering MCP connections...');
  }

  hideWindow() {
    ipcRenderer.invoke('hide-window');
  }

  quitApp() {
    ipcRenderer.invoke('quit-app');
  }
}

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
