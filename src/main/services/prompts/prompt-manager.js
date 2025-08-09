const { baseConfig } = require('./config/base');
const { techConfig } = require('./config/tech');
const { userConfig } = require('./config/user');

class PromptManager {
  constructor() {
    this.baseConfig = baseConfig;
    this.techConfig = techConfig;
    this.userConfig = userConfig;
  }

  getBasePrompt() {
    return `${this.baseConfig.role}

IMPORTANT RESPONSE GUIDELINES:
${this.baseConfig.guidelines.join('\n')}

You can:
${this.baseConfig.capabilities.join('\n')}

Always be concise but thorough in your responses.`;
  }

  getTechPrompt() {
    return `You are an expert in ${this.techConfig.expertise.general.join(', ')}.
${this.techConfig.personality}`;
  }

  getUserContextPrompt() {
    const { personal, interests, learningStyle } = this.userConfig;
    return `Your user is ${personal.name}, ${personal.education}. 
Currently: ${personal.work.join(', ')}. 
Career goal: ${personal.careerGoal}

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
