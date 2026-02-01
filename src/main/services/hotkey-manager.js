/**
 * Hotkey Manager Service
 * Manages global hotkeys for the application using Electron's globalShortcut module.
 * 
 * Author: DJ Leamen, 2025-2026
 */

const { globalShortcut } = require('electron');
const Store = require('electron-store');

/**
 * HotkeyManager class to manage global hotkeys using Electron's globalShortcut module.
 * Provides registration, validation, and management of keyboard shortcuts.
 */
class HotkeyManager {
  constructor() {
    /**
     * Creates a HotkeyManager instance.
     * Initializes storage and default hotkey mappings.
     */
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
    /**
     * Initializes and registers hotkeys from storage or defaults.
     * 
     * @async
     * @returns {Promise<void>}
     */
    const customHotkeys = this.store.get('customHotkeys', {});
    const hotkeys = { ...this.defaultHotkeys, ...customHotkeys };

    for (const [action, shortcut] of Object.entries(hotkeys)) {
      await this.registerHotkey(action, shortcut);
    }
  }

  async registerHotkey(action, shortcut, callback = null) {
    /**
     * Registers a global hotkey.
     * 
     * @param {string} action - The action identifier for the hotkey.
     * @param {string} shortcut - The shortcut string (e.g., 'CommandOrControl+Shift+M').
     * @param {function|null} callback - Optional callback to execute on hotkey press.
     * @returns {boolean} True if registration was successful, else false.
     */
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

  unregisterHotkey(action) {
    /**
     * Unregisters a global hotkey.
     * 
     * @param {string} action - The action identifier for the hotkey.
     * @returns {boolean} True if unregistration was successful, else false.
     */
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
    /**
     * Handles the action associated with a hotkey.
     * 
     * @param {string} action - The action identifier for the hotkey.
     */
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
    /**
     * Returns the currently registered hotkeys.
     * 
     * @returns {object} An object mapping actions to their shortcuts.
     */
    return Object.fromEntries(this.registeredHotkeys);
  }

  saveCustomHotkey(action, shortcut) {
    /**
     * Saves a custom hotkey to the store.
     * 
     * @param {string} action - The action identifier for the hotkey.
     * @param {string} shortcut - The shortcut string (e.g., 'CommandOrControl+Shift+M').
     */
    const customHotkeys = this.store.get('customHotkeys', {});
    customHotkeys[action] = shortcut;
    this.store.set('customHotkeys', customHotkeys);
  }

  resetToDefaults() {
    /**
     * Resets all hotkeys to their default values.
     * Unregisters custom hotkeys and re-registers defaults.
     * 
     * @returns {void}
     */
    for (const [action] of this.registeredHotkeys) {
      this.unregisterHotkey(action);
    }

    this.store.delete('customHotkeys');

    for (const [action, shortcut] of Object.entries(this.defaultHotkeys)) {
      this.registerHotkey(action, shortcut);
    }
  }

  isValidShortcut(shortcut) {
    /**
     * Validates the format of a shortcut string.
     * 
     * @param {string} shortcut - The shortcut string to validate.
     * @returns {boolean} True if valid, else false.
     */
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
    /**
     * Checks if a key is valid for use in a shortcut.
     * 
     * @param {string} key - The key to validate.
     * @returns {boolean} True if valid, else false.
     */
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

  getAvailableModifiers() {
    /**
     * Gets list of available keyboard modifiers.
     * 
     * @returns {Array<string>} Array of available modifier key names.
     */
    return [
      'CommandOrControl',
      'Alt',
      'Shift',
      'Super'
    ];
  }

  getAvailableKeys() {
    /**
     * Gets list of available keys for hotkey combinations.
     * 
     * @returns {Array<string>} Array of available key names.
     */
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
    /**
     * Cleans up all registered hotkeys.
     * Should be called on application shutdown.
     * 
     * @returns {void}
     */
    for (const [action] of this.registeredHotkeys) {
      this.unregisterHotkey(action);
    }
    globalShortcut.unregisterAll();
  }
}

module.exports = { HotkeyManager };
