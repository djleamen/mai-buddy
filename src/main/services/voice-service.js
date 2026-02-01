/**
 * VoiceService
 * Manages text-to-speech and speech recognition functionalities.
 * Integrates with ElevenLabs API for TTS and Web Speech API for recognition.
 * 
 * Author: DJ Leamen, 2025-2026
 */

const { ElevenLabsClient } = require('elevenlabs');
const Store = require('electron-store');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * VoiceService class to manage text-to-speech and speech recognition.
 * Integrates with ElevenLabs for TTS and Web Speech API for recognition.
 */
class VoiceService {
  constructor() {
    /**
     * Creates a VoiceService instance.
     * Initializes storage, ElevenLabs client, and recognition settings.
     */
    this.store = new Store();
    this.elevenLabs = null;
    this.isListening = false;
    this.triggerWords = new Map();
    this.audioContext = null;
    this.microphone = null;
    this.speechRecognition = null;
  }

  async initialize() {
    /**
     * Initializes the VoiceService.
     * Sets up ElevenLabs client and speech recognition if configured.
     * 
     * @async
     * @returns {Promise<void>}
     */
    const settings = this.store.get('settings', {});
    
    if (settings.elevenLabsApiKey) {
      this.elevenLabs = new ElevenLabsClient({
        apiKey: settings.elevenLabsApiKey
      });
    }

    await this.setupSpeechRecognition();
  }

  async setupSpeechRecognition() {
    /**
     * Sets up speech recognition using Web Speech API.
     * 
     * @async
     * @returns {Promise<void>}
     */
    try {
      // Check if running in browser environment
      if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
        const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
        this.speechRecognition = new SpeechRecognition();
        this.speechRecognition.continuous = true;
        this.speechRecognition.interimResults = true;
        this.speechRecognition.lang = 'en-US';

        this.speechRecognition.onresult = (event) => {
          const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
          this.processTranscript(transcript);
        };

        this.speechRecognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
        };
      } else {
        // Fallback for Node.js environment
        // Web Speech API not available in Electron main process
      }
    } catch (error) {
      console.error('Error setting up speech recognition:', error);
    }
  }

  async textToSpeech(text, options = {}) {
    /**
     * Converts text to speech using ElevenLabs API.
     * 
     * @async
     * @param {string} text - The text to convert to speech.
     * @param {Object} [options={}] - Voice synthesis options.
     * @param {string} [options.voice='Rachel'] - Voice ID to use.
     * @param {string} [options.model='eleven_monolingual_v1'] - Model ID to use.
     * @param {number} [options.stability=0.5] - Voice stability (0-1).
     * @param {number} [options.similarityBoost=0.5] - Similarity boost (0-1).
     * @param {number} [options.style=0.0] - Speaking style (0-1).
     * @param {boolean} [options.useSpeakerBoost=true] - Use speaker boost.
     * @returns {Promise<string>} Path to the generated audio file.
     * @throws {Error} If ElevenLabs not configured or generation fails.
     */
    if (!this.elevenLabs) {
      throw new Error('ElevenLabs API key not configured. Please set it in settings.');
    }

    try {
      const voice = options.voice || 'Rachel'; // feel free to customize
      const model = options.model || 'eleven_monolingual_v1';

      const audio = await this.elevenLabs.textToSpeech.convert({
        voice_id: voice,
        text: text,
        model_id: model,
        voice_settings: {
          stability: options.stability || 0.5,
          similarity_boost: options.similarityBoost || 0.5,
          style: options.style || 0.0,
          use_speaker_boost: options.useSpeakerBoost || true
        }
      });

      // Save audio to temporary file and play
      const audioPath = path.join(__dirname, '../../../temp', `speech_${Date.now()}.mp3`);
      await this.ensureDirectoryExists(path.dirname(audioPath));
      
      const buffer = Buffer.from(await audio.arrayBuffer());
      fs.writeFileSync(audioPath, buffer);

      await this.playAudio(audioPath);

      // Clean up temporary file after playing
      setTimeout(() => {
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
      }, 5000);

      return audioPath;

    } catch (error) {
      console.error('Error generating speech:', error);
      throw error;
    }
  }

  async playAudio(audioPath) {
    /**
     * Plays an audio file using the system default player.
     * 
     * @async
     * @param {string} audioPath - Path to the audio file.
     * @returns {Promise<void>}
     */
    return new Promise((resolve, reject) => {
      let player;
      
      // Determine the audio player based on platform
      if (process.platform === 'darwin') {
        player = spawn('afplay', [audioPath]);
      } else if (process.platform === 'win32') {
        player = spawn('powershell', ['-c', `(New-Object Media.SoundPlayer "${audioPath}").PlaySync()`]);
      } else {
        player = spawn('aplay', [audioPath]);
      }

      player.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Audio player exited with code ${code}`));
        }
      });

      player.on('error', (error) => {
        reject(error);
      });
    });
  }

  async startListening() {
    /**
     * Starts listening for voice input.
     * 
     * @async
     * @returns {Promise<void>}
     */
    if (this.speechRecognition && !this.isListening) {
      try {
        this.isListening = true;
        this.speechRecognition.start();
        console.log('Started listening for voice input...');
      } catch (error) {
        console.error('Error starting speech recognition:', error);
        this.isListening = false;
      }
    }
  }

  stopListening() {
    /**
     * Stops listening for voice input.
     * 
     * @returns {void}
     */
    if (this.speechRecognition && this.isListening) {
      this.speechRecognition.stop();
      this.isListening = false;
      console.log('Stopped listening for voice input.');
    }
  }

  onTriggerWord(phrase, callback) {
    /**
     * Registers a trigger word with a callback.
     * 
     * @param {string} phrase - The trigger phrase to listen for.
     * @param {Function} callback - The callback to execute when phrase is detected.
     * @returns {void}
     */
    this.triggerWords.set(phrase.toLowerCase(), callback);
  }

  processTranscript(transcript) {
    /**
     * Processes recognized transcript for trigger words.
     * 
     * @param {string} transcript - The recognized transcript text.
     * @returns {void}
     */
    console.log('Transcript:', transcript);
    
    // Check for trigger words
    for (const [triggerPhrase, callback] of this.triggerWords) {
      if (transcript.includes(triggerPhrase)) {
        console.log(`Trigger phrase detected: ${triggerPhrase}`);
        callback(transcript);
        break;
      }
    }
  }

  async getAvailableVoices() {
    /**
     * Gets available voices from ElevenLabs.
     * 
     * @async
     * @returns {Promise<Array>} Array of available voice objects.
     * @throws {Error} If ElevenLabs not configured.
     */
    if (!this.elevenLabs) {
      return [];
    }

    try {
      const voices = await this.elevenLabs.voices.getAll();
      return voices.voices.map(voice => ({
        id: voice.voice_id,
        name: voice.name,
        category: voice.category,
        description: voice.description || '',
        previewUrl: voice.preview_url
      }));
    } catch (error) {
      console.error('Error fetching voices:', error);
      return [];
    }
  }

  async ensureDirectoryExists(dirPath) {
    /**
     * Ensures a directory exists, creates it if it doesn't.
     * 
     * @async
     * @param {string} dirPath - Directory path to ensure exists.
     * @returns {Promise<void>}
     */
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  setVoiceSettings(settings) {
    /**
     * Sets voice settings in storage.
     * 
     * @param {Object} settings - Voice settings object.
     * @returns {void}
     */
    this.store.set('voiceSettings', settings);
  }

  getVoiceSettings() {
    /**
     * Gets voice settings from storage.
     * 
     * @returns {Object} Voice settings object with defaults.
     */
    return this.store.get('voiceSettings', {
      voice: 'Rachel',
      model: 'eleven_monolingual_v1',
      stability: 0.5,
      similarityBoost: 0.5,
      style: 0.0,
      useSpeakerBoost: true
    });
  }
}

module.exports = { VoiceService };
