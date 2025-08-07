const { ElevenLabsClient } = require('elevenlabs');
const Store = require('electron-store');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class VoiceService {
  constructor() {
    this.store = new Store();
    this.elevenLabs = null;
    this.isListening = false;
    this.triggerWords = new Map();
    this.audioContext = null;
    this.microphone = null;
    this.speechRecognition = null;
  }

  async initialize() {
    const settings = this.store.get('settings', {});
    
    if (settings.elevenLabsApiKey) {
      this.elevenLabs = new ElevenLabsClient({
        apiKey: settings.elevenLabsApiKey
      });
    }

    await this.setupSpeechRecognition();
  }

  async setupSpeechRecognition() {
    try {
      // Check if running in browser environment
      if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
        this.speechRecognition = new window.webkitSpeechRecognition();
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
        console.log('Web Speech API not available, using fallback speech recognition');
      }
    } catch (error) {
      console.error('Error setting up speech recognition:', error);
    }
  }

  async textToSpeech(text, options = {}) {
    if (!this.elevenLabs) {
      throw new Error('ElevenLabs API key not configured. Please set it in settings.');
    }

    try {
      const voice = options.voice || 'Rachel'; // Default voice
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
    if (this.speechRecognition && this.isListening) {
      this.speechRecognition.stop();
      this.isListening = false;
      console.log('Stopped listening for voice input.');
    }
  }

  onTriggerWord(phrase, callback) {
    this.triggerWords.set(phrase.toLowerCase(), callback);
  }

  processTranscript(transcript) {
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
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  setVoiceSettings(settings) {
    this.store.set('voiceSettings', settings);
  }

  getVoiceSettings() {
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
