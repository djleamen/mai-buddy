/**
 * PromptManager service to construct prompts based on various configurations.
 * Combines base, tech, and user-specific configurations to create tailored prompts.
 * 
 * Author: DJ Leamen, 2025-2026
 */

const { baseConfig } = require('./config/base');
const { techConfig } = require('./config/tech');
const { userConfig } = require('./config/user');

class PromptManager {
  constructor() {
    /**
     * Creates a PromptManager instance.
     * Initializes base, tech, and user configurations.
     */
    this.baseConfig = baseConfig;
    this.techConfig = techConfig;
    this.userConfig = userConfig;
  }

  getBasePrompt() {
    /**
     * Builds the base prompt with role, guidelines, and capabilities.
     * 
     * @returns {string} The base prompt text.
     */
    return `${this.baseConfig.role}

IMPORTANT RESPONSE GUIDELINES:
${this.baseConfig.guidelines.join('\n')}

You can:
${this.baseConfig.capabilities.join('\n')}

Always be concise but thorough in your responses.`;
  }

  getTechPrompt() {
    /**
     * Builds tech expertise prompt from configuration.
     * 
     * @returns {string} The tech expertise prompt text.
     */
    return `You are an expert in ${this.techConfig.expertise.general.join(', ')}.
${this.techConfig.personality}`;
  }

  getUserContextPrompt() {
    /**
     * Constructs a prompt section based on user-specific details.
     * 
     * @returns {string} User context prompt section.
     */
    const { personal, interests, learningStyle } = this.userConfig;
    const interestsText = [
      interests.sports?.length ? `Sports: ${interests.sports.join(', ')}` : '',
      interests.music?.genres?.length ? `Music: ${interests.music.genres.join(', ')}` : '',
      interests.music?.bands?.length ? `Bands: ${interests.music.bands.join(', ')}` : '',
      interests.entertainment?.movies?.length ? `Movies: ${interests.entertainment.movies.join(', ')}` : '',
      interests.entertainment?.tvShows?.length ? `TV Shows: ${interests.entertainment.tvShows.join(', ')}` : '',
      interests.entertainment?.books?.length ? `Books: ${interests.entertainment.books.join(', ')}` : ''
    ].filter(text => text).join('; ');

    return `Your user is ${personal.name}, ${personal.education}. 
Currently: ${personal.work.join(', ')}. 
Career goal: ${personal.careerGoal}
Interests: ${interestsText || 'Not specified'}

Learning Style: ${learningStyle}`;
  }

  constructPrompt(options = {}) {
    /**
     * Constructs the full prompt based on specified options.
     * 
     * @param {object} options - Options to include tech and user context.
     * @param {boolean} options.includeTech - Whether to include tech expertise.
     * @param {boolean} options.includeUserContext - Whether to include user context.
     * @returns {string} The constructed prompt.
     */
    const sections = [this.getBasePrompt()];
    
    if (options.includeTech) {
      sections.push(this.getTechPrompt());
    }
    
    if (options.includeUserContext) {
      sections.push(this.getUserContextPrompt());
    }
    
    return sections.join('\n\n');
  }
}

module.exports = { PromptManager };
