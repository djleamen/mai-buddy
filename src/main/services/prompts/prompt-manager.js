/*
 * Prompt manager to build the prompt for Mai Buddy.
 * Configurations are separated to improve modularity and maintainability.
 */

const { baseConfig } = require('./config/base');
const { techConfig } = require('./config/tech');
const { userConfig } = require('./config/user');

// PromptManager class to construct prompts based on configurations
class PromptManager {
  constructor() {
    this.baseConfig = baseConfig;
    this.techConfig = techConfig;
    this.userConfig = userConfig;
  }

  // Build the base prompt with role, guidelines, and capabilities
  getBasePrompt() {
    return `${this.baseConfig.role}

IMPORTANT RESPONSE GUIDELINES:
${this.baseConfig.guidelines.join('\n')}

You can:
${this.baseConfig.capabilities.join('\n')}

Always be concise but thorough in your responses.`;
  }

  // Build tech expertise prompt
  getTechPrompt() {
    return `You are an expert in ${this.techConfig.expertise.general.join(', ')}.
${this.techConfig.personality}`;
  }

  // Build user context prompt
  getUserContextPrompt() {
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
