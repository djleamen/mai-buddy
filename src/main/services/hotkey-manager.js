/*
 * HotkeyManager is responsible for managing global hotkeys in the application.
 * It allows registering, unregistering, and handling hotkey actions.
 * Feel free to customize hotkeys and their actions as needed.
 */

const { globalShortcut } = require('electron');
const Store = require('electron-store');

// HotkeyManager class to manage global hotkeys
class HotkeyManager {
  constructor() {
    this.store = new Store();
    this.registeredHotkeys = new Map();
    this.defaultHotkeys = {
      'show-chat': 'CommandOrControl+Shift+M',
      'voice-activation': 'CommandOrControl+Shift+V',
      'quick-capture': 'CommandOrControl+Shift+C',
      'toggle-listening': 'CommandOrControl+Shift+L',
      'hide-window': 'Escape'
    };
  }

  // Initialize and register hotkeys from store or defaults
  async initialize() {
    const customHotkeys = this.store.get('customHotkeys', {});
    const hotkeys = { ...this.defaultHotkeys, ...customHotkeys };

    for (const [action, shortcut] of Object.entries(hotkeys)) {
      await this.registerHotkey(action, shortcut);
    }
  }

  // Register a global hotkey with optional callback
  async registerHotkey(action, shortcut, callback = null) {
    try {
      if (this.registeredHotkeys.has(action)) {
        const existingShortcut = this.registeredHotkeys.get(action);
        globalShortcut.unregister(existingShortcut);
      }

      const success = globalShortcut.register(shortcut, () => {
        if (callback) {
          callback(action);
        } else {
          this.handleHotkeyAction(action);
        }
      });

      if (success) {
        this.registeredHotkeys.set(action, shortcut);
        console.log(`Registered hotkey: ${action} -> ${shortcut}`);
        return true;
      } else {
        console.error(`Failed to register hotkey: ${shortcut}`);
        return false;
      }
    } catch (error) {
      console.error(`Error registering hotkey ${shortcut}:`, error);
      return false;
    }
  }

  // Unregister a global hotkey
  unregisterHotkey(action) {
    if (this.registeredHotkeys.has(action)) {
      const shortcut = this.registeredHotkeys.get(action);
      globalShortcut.unregister(shortcut);
      this.registeredHotkeys.delete(action);
      console.log(`Unregistered hotkey: ${action} -> ${shortcut}`);
      return true;
    }
    return false;
  }

  // Handle hotkey action by emitting corresponding IPC events
  handleHotkeyAction(action) {
    const { ipcMain } = require('electron');
    
    switch (action) {
    case 'show-chat':
      ipcMain.emit('hotkey-show-chat');
      break;
    case 'voice-activation':
      ipcMain.emit('hotkey-voice-activation');
      break;
    case 'quick-capture':
      ipcMain.emit('hotkey-quick-capture');
      break;
    case 'toggle-listening':
      ipcMain.emit('hotkey-toggle-listening');
      break;
    case 'hide-window':
      ipcMain.emit('hotkey-hide-window');
      break;
    default:
      console.log(`Unknown hotkey action: ${action}`);
    }
  }

  getRegisteredHotkeys() {
    return Object.fromEntries(this.registeredHotkeys);
  }

  saveCustomHotkey(action, shortcut) {
    const customHotkeys = this.store.get('customHotkeys', {});
    customHotkeys[action] = shortcut;
    this.store.set('customHotkeys', customHotkeys);
  }

  // Reset all hotkeys to their default values
  resetToDefaults() {
    for (const [action] of this.registeredHotkeys) {
      this.unregisterHotkey(action);
    }

    this.store.delete('customHotkeys');

    for (const [action, shortcut] of Object.entries(this.defaultHotkeys)) {
      this.registerHotkey(action, shortcut);
    }
  }

  // Validate if a shortcut string is in correct format
  isValidShortcut(shortcut) {
    // Basic validation for Electron accelerator format
    const validModifiers = ['CommandOrControl', 'Alt', 'Option', 'AltGr', 'Shift', 'Super', 'Meta'];
    
    const parts = shortcut.split('+');
    const key = parts[parts.length - 1];
    const modifiers = parts.slice(0, -1);

    // Check if key is valid using simpler checks
    if (!this._isValidKey(key)) {
      return false;
    }

    for (const modifier of modifiers) {
      if (!validModifiers.includes(modifier)) {
        return false;
      }
    }

    return true;
  }

  _isValidKey(key) {
    // Check for alphanumeric characters
    if (/^[A-Za-z\d]$/.test(key)) {
      return true;
    }
    
    // Check for function keys
    if (/^F([1-9]|1\d|2[0-4])$/.test(key)) {
      return true;
    }
    
    // Check for special keys
    const specialKeys = [
      'Space', 'Tab', 'Backspace', 'Delete', 'Insert', 'Return', 'Enter',
      'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown',
      'Escape', 'VolumeUp', 'VolumeDown', 'VolumeMute',
      'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop', 'MediaPlayPause'
    ];
    
    return specialKeys.includes(key);
  }

  // Get list of available modifier keys for shortcuts
  getAvailableModifiers() {
    return [
      'CommandOrControl',
      'Alt',
      'Shift',
      'Super'
    ];
  }

  // Get list of available keys for shortcuts
  getAvailableKeys() {
    return [
      // Letters
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
      // Numbers
      ...'0123456789'.split(''),
      // Function keys
      ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
      // Special keys
      'Space', 'Tab', 'Backspace', 'Delete', 'Insert', 'Return', 'Enter',
      'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown',
      'Escape', 'VolumeUp', 'VolumeDown', 'VolumeMute',
      'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop', 'MediaPlayPause'
    ];
  }

  // Cleanup all registered hotkeys
  cleanup() {
    for (const [action] of this.registeredHotkeys) {
      this.unregisterHotkey(action);
    }
    globalShortcut.unregisterAll();
  }
}

module.exports = { HotkeyManager };
