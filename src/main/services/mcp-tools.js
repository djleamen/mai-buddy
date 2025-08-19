/*
 * MCP Tools Registry
 * Defines available tools for different MCP connections
 */

const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const { ToolHandlers } = require('./tool-handlers');

const execAsync = promisify(exec);

class MCPTools {
  constructor() {
    this.tools = new Map();
    try {
      this.toolHandlers = new ToolHandlers();
    } catch (err) {
      throw new Error(`Failed to initialize ToolHandlers in MCPTools constructor: ${err?.message ?? err}`);
    }
    this.registerDefaultTools();
  }

  registerDefaultTools() {
    // File System Tools
    this.registerTool('filesystem', 'read_file', {
      description: 'Read content from a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to read' }
        },
        required: ['path']
      },
      handler: async ({ path: filePath }) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return { success: true, content };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    });

    this.registerTool('filesystem', 'write_file', {
      description: 'Write content to a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to write' },
          content: { type: 'string', description: 'Content to write' }
        },
        required: ['path', 'content']
      },
      handler: async ({ path: filePath, content }) => {
        try {
          await fs.writeFile(filePath, content, 'utf8');
          return { success: true, message: 'File written successfully' };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    });

    this.registerTool('filesystem', 'list_directory', {
      description: 'List contents of a directory',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path to list' }
        },
        required: ['path']
      },
      handler: async ({ path: dirPath }) => {
        try {
          const items = await fs.readdir(dirPath, { withFileTypes: true });
          const contents = items.map(item => ({
            name: item.name,
            type: item.isDirectory() ? 'directory' : 'file'
          }));
          return { success: true, contents };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    });

    // Terminal Tools
    this.registerTool('terminal', 'execute_command', {
      description: 'Execute a shell command',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to execute' },
          cwd: { type: 'string', description: 'Working directory (optional)' }
        },
        required: ['command']
      },
      handler: async ({ command, cwd }) => {
        try {
          const options = cwd ? { cwd } : {};
          
          // If the command is a script file, check if it's executable
          if (command.endsWith('.sh') && (command.startsWith('./') || command.startsWith('/'))) {
            try {
              // Make the script executable if it's not already
              await execAsync(`chmod +x "${command}"`, options);
            } catch (chmodError) {
              // If chmod fails, continue anyway - the script might already be executable
              console.log(`Note: Could not make ${command} executable:`, chmodError.message);
            }
          }
          
          const { stdout, stderr } = await execAsync(command, options);
          return { 
            success: true, 
            stdout: stdout.trim(), 
            stderr: stderr.trim(),
            command: command 
          };
        } catch (error) {
          return { 
            success: false, 
            error: error.message,
            stdout: error.stdout || '',
            stderr: error.stderr || '',
            command: command
          };
        }
      }
    });

    // GitHub Tools - Full API Integration
    this.registerTool('github', 'list_repositories', {
      description: 'List user repositories',
      parameters: {
        type: 'object',
        properties: {
          username: { type: 'string', description: 'GitHub username' },
          type: { type: 'string', enum: ['all', 'owner', 'public', 'private'], default: 'all' },
          sort: { type: 'string', enum: ['created', 'updated', 'pushed', 'full_name'], default: 'updated' },
          per_page: { type: 'number', description: 'Number of results per page (max 100)', default: 30 }
        },
        required: ['username']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleGitHubTools('list_repositories', params);
      }
    });

    this.registerTool('github', 'create_issue', {
      description: 'Create a new GitHub issue',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          title: { type: 'string', description: 'Issue title' },
          body: { type: 'string', description: 'Issue description' },
          labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels' },
          assignees: { type: 'array', items: { type: 'string' }, description: 'Assignee usernames' }
        },
        required: ['owner', 'repo', 'title']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleGitHubTools('create_issue', params);
      }
    });

    this.registerTool('github', 'get_repository', {
      description: 'Get repository information',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' }
        },
        required: ['owner', 'repo']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleGitHubTools('get_repository', params);
      }
    });

    this.registerTool('github', 'list_issues', {
      description: 'List repository issues',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
          sort: { type: 'string', enum: ['created', 'updated', 'comments'], default: 'updated' },
          per_page: { type: 'number', description: 'Number of results per page (max 100)', default: 30 }
        },
        required: ['owner', 'repo']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleGitHubTools('list_issues', params);
      }
    });

    this.registerTool('github', 'create_pull_request', {
      description: 'Create a new pull request',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          title: { type: 'string', description: 'Pull request title' },
          head: { type: 'string', description: 'The name of the branch where your changes are implemented' },
          base: { type: 'string', description: 'The name of the branch you want the changes pulled into' },
          body: { type: 'string', description: 'Pull request description' }
        },
        required: ['owner', 'repo', 'title', 'head', 'base']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleGitHubTools('create_pull_request', params);
      }
    });

    this.registerTool('github', 'search_code', {
      description: 'Search for code in GitHub repositories',
      parameters: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search query' },
          sort: { type: 'string', enum: ['indexed', 'best-match'], default: 'indexed' },
          order: { type: 'string', enum: ['desc', 'asc'], default: 'desc' },
          per_page: { type: 'number', description: 'Number of results per page (max 100)', default: 30 }
        },
        required: ['q']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleGitHubTools('search_code', params);
      }
    });

    this.registerTool('github', 'get_user', {
      description: 'Get user information',
      parameters: {
        type: 'object',
        properties: {
          username: { type: 'string', description: 'GitHub username' }
        },
        required: ['username']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleGitHubTools('get_user', params);
      }
    });

    this.registerTool('github', 'list_commits', {
      description: 'List commits in a repository',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          sha: { type: 'string', description: 'SHA or branch to start listing commits from' },
          per_page: { type: 'number', description: 'Number of results per page (max 100)', default: 30 }
        },
        required: ['owner', 'repo']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleGitHubTools('list_commits', params);
      }
    });

    // System Calendar Tools (fallback for local calendar)
    this.registerTool('calendar', 'create_event', {
      description: 'Create a system calendar event (fallback)',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Event title' },
          start: { type: 'string', description: 'Start date/time (ISO format)' },
          end: { type: 'string', description: 'End date/time (ISO format)' },
          description: { type: 'string', description: 'Event description' }
        },
        required: ['title', 'start', 'end']
      },
      handler: async ({ title, start, end, description }) => {
        return { 
          success: true, 
          message: `Would create event "${title}" from ${start} to ${end}`,
          note: 'This requires system calendar integration'
        };
      }
    });

    // Notion Tools (examples)
    this.registerTool('notion', 'query_database', {
      description: 'Query a Notion database',
      parameters: {
        type: 'object',
        properties: {
          database_id: { type: 'string', description: 'Database ID' },
          filter: { type: 'object', description: 'Query filter' },
          sorts: { type: 'array', description: 'Sort criteria' }
        },
        required: ['database_id']
      },
      handler: async ({ database_id }) => {
        return { 
          success: true, 
          message: `Would query Notion database ${database_id}`,
          note: 'This requires proper Notion API integration'
        };
      }
    });

    // Slack Tools (examples)
    this.registerTool('slack', 'send_message', {
      description: 'Send a message to a Slack channel',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Channel ID or name' },
          text: { type: 'string', description: 'Message text' },
          thread_ts: { type: 'string', description: 'Thread timestamp (optional)' }
        },
        required: ['channel', 'text']
      },
      handler: async ({ channel, text }) => {
        return { 
          success: true, 
          message: `Would send message to ${channel}: "${text}"`,
          note: 'This requires proper Slack API integration'
        };
      }
    });
  }

  registerTool(connectionType, toolName, toolDefinition) {
    if (!this.tools.has(connectionType)) {
      this.tools.set(connectionType, new Map());
    }
    this.tools.get(connectionType).set(toolName, toolDefinition);
  }

  getToolsForConnection(connectionType) {
    return this.tools.get(connectionType) || new Map();
  }

  getAllTools() {
    const allTools = {};
    for (const [connectionType, tools] of this.tools) {
      allTools[connectionType] = Object.fromEntries(tools);
    }
    return allTools;
  }

  async executeTool(connectionType, toolName, parameters) {
    const tools = this.getToolsForConnection(connectionType);
    const tool = tools.get(toolName);
    
    if (!tool) {
      throw new Error(`Tool ${toolName} not found for connection type ${connectionType}`);
    }

    try {
      return await tool.handler(parameters);
    } catch (error) {
      throw new Error(`Tool execution failed: ${error.message}`);
    }
  }

  getToolDefinition(connectionType, toolName) {
    const tools = this.getToolsForConnection(connectionType);
    const tool = tools.get(toolName);
    
    if (!tool) {
      return null;
    }

    return {
      name: toolName,
      description: tool.description,
      parameters: tool.parameters
    };
  }

  getToolsListForConnection(connectionType) {
    const tools = this.getToolsForConnection(connectionType);
    return Array.from(tools.keys()).map(toolName => 
      this.getToolDefinition(connectionType, toolName)
    );
  }

  // Configuration methods for GitHub
  setGitHubToken(token) {
    return this.toolHandlers.setGitHubToken(token);
  }

  getToolHandlers() {
    return this.toolHandlers;
  }
}

module.exports = { MCPTools };
