const { globalShortcut } = require('electron');
const Store = require('electron-store');

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

  async initialize() {
    const customHotkeys = this.store.get('customHotkeys', {});
    const hotkeys = { ...this.defaultHotkeys, ...customHotkeys };

    for (const [action, shortcut] of Object.entries(hotkeys)) {
      await this.registerHotkey(action, shortcut);
    }
  }

  async registerHotkey(action, shortcut, callback = null) {
    try {
      // Unregister existing hotkey for this action
      if (this.registeredHotkeys.has(action)) {
        const existingShortcut = this.registeredHotkeys.get(action);
        globalShortcut.unregister(existingShortcut);
      }

      // Register new hotkey
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

  resetToDefaults() {
    // Unregister all current hotkeys
    for (const [action] of this.registeredHotkeys) {
      this.unregisterHotkey(action);
    }

    // Clear custom hotkeys
    this.store.delete('customHotkeys');

    // Re-register default hotkeys
    for (const [action, shortcut] of Object.entries(this.defaultHotkeys)) {
      this.registerHotkey(action, shortcut);
    }
  }

  isValidShortcut(shortcut) {
    // Basic validation for Electron accelerator format
    const validModifiers = ['CommandOrControl', 'Alt', 'Option', 'AltGr', 'Shift', 'Super', 'Meta'];
    const validKeys = /^[A-Za-z0-9]$|^F[1-9]$|^F1[0-9]$|^F2[0-4]$|^Space$|^Tab$|^Backspace$|^Delete$|^Insert$|^Return$|^Enter$|^Up$|^Down$|^Left$|^Right$|^Home$|^End$|^PageUp$|^PageDown$|^Escape$|^VolumeUp$|^VolumeDown$|^VolumeMute$|^MediaNextTrack$|^MediaPreviousTrack$|^MediaStop$|^MediaPlayPause$/;

    const parts = shortcut.split('+');
    const key = parts[parts.length - 1];
    const modifiers = parts.slice(0, -1);

    // Check if key is valid
    if (!validKeys.test(key)) {
      return false;
    }

    // Check if modifiers are valid
    for (const modifier of modifiers) {
      if (!validModifiers.includes(modifier)) {
        return false;
      }
    }

    return true;
  }

  getAvailableModifiers() {
    return [
      'CommandOrControl',
      'Alt',
      'Shift',
      'Super'
    ];
  }

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

  cleanup() {
    // Unregister all hotkeys
    for (const [action] of this.registeredHotkeys) {
      this.unregisterHotkey(action);
    }
    globalShortcut.unregisterAll();
  }
}

module.exports = { HotkeyManager };
