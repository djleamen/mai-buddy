/*
 * MCP Tools Registry
 * Defines available tools for different MCP connections
 */

const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const { ToolHandlers } = require('./tool-handlers');
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

// Helper function to expand ~ in paths
function expandPath(filePath) {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  if (filePath === '~') {
    return os.homedir();
  }
  return filePath;
}

// MCPTools class to manage tool registrations and executions
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

  // Register default tools for various connection types
  registerDefaultTools() {
    /* File System Tools */
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
          const expandedPath = expandPath(filePath);
          const content = await fs.readFile(expandedPath, 'utf8');
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
          const expandedPath = expandPath(filePath);
          await fs.writeFile(expandedPath, content, 'utf8');
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
          const expandedPath = expandPath(dirPath);
          const items = await fs.readdir(expandedPath, { withFileTypes: true });
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

    /* Terminal Tools */
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

    /* GitHub Tools */
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

    /* System Calendar Tools (fallback for local calendar) */
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
      handler: async ({ title, start, end }) => {
        return { 
          success: true, 
          message: `Would create event "${title}" from ${start} to ${end}`,
          note: 'This requires system calendar integration'
        };
      }
    });

    /* Notion Tools */
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
      handler: async (params) => {
        return await this.toolHandlers.handleNotionTools('query_database', params);
      }
    });

    this.registerTool('notion', 'create_page', {
      description: 'Create a new Notion page',
      parameters: {
        type: 'object',
        properties: {
          parent: { type: 'object', description: 'Parent page or database' },
          properties: { type: 'object', description: 'Page properties' },
          children: { type: 'array', description: 'Page content blocks' }
        },
        required: ['parent', 'properties']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleNotionTools('create_page', params);
      }
    });

    this.registerTool('notion', 'get_page', {
      description: 'Get a Notion page by ID',
      parameters: {
        type: 'object',
        properties: {
          page_id: { type: 'string', description: 'Page ID' }
        },
        required: ['page_id']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleNotionTools('get_page', params);
      }
    });

    this.registerTool('notion', 'update_page', {
      description: 'Update a Notion page',
      parameters: {
        type: 'object',
        properties: {
          page_id: { type: 'string', description: 'Page ID' },
          properties: { type: 'object', description: 'Page properties to update' }
        },
        required: ['page_id', 'properties']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleNotionTools('update_page', params);
      }
    });

    this.registerTool('notion', 'search', {
      description: 'Search Notion workspace',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          filter: { type: 'object', description: 'Filter by page or database' }
        },
        required: ['query']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleNotionTools('search', params);
      }
    });

    /* Slack Tools */
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
      handler: async (params) => {
        return await this.toolHandlers.handleSlackTools('send_message', params);
      }
    });

    this.registerTool('slack', 'list_channels', {
      description: 'List Slack channels',
      parameters: {
        type: 'object',
        properties: {
          types: { type: 'string', description: 'Channel types to list', default: 'public_channel,private_channel' }
        }
      },
      handler: async (params) => {
        return await this.toolHandlers.handleSlackTools('list_channels', params);
      }
    });

    this.registerTool('slack', 'get_channel_history', {
      description: 'Get channel message history',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Channel ID' },
          limit: { type: 'number', description: 'Number of messages to retrieve', default: 100 }
        },
        required: ['channel']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleSlackTools('get_channel_history', params);
      }
    });

    this.registerTool('slack', 'upload_file', {
      description: 'Upload a file to Slack',
      parameters: {
        type: 'object',
        properties: {
          channels: { type: 'string', description: 'Comma-separated channel IDs' },
          file: { type: 'string', description: 'File path or content' },
          filename: { type: 'string', description: 'Filename' },
          title: { type: 'string', description: 'File title' }
        },
        required: ['channels', 'file', 'filename']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleSlackTools('upload_file', params);
      }
    });

    this.registerTool('slack', 'list_users', {
      description: 'List Slack workspace users',
      parameters: {
        type: 'object',
        properties: {}
      },
      handler: async (params) => {
        return await this.toolHandlers.handleSlackTools('list_users', params);
      }
    });

    /* Docker Tools */
    this.registerTool('docker', 'list_containers', {
      description: 'List Docker containers',
      parameters: {
        type: 'object',
        properties: {
          all: { type: 'boolean', description: 'Show all containers (default shows running only)', default: false }
        }
      },
      handler: async (params) => {
        return await this.toolHandlers.handleDockerTools('list_containers', params);
      }
    });

    this.registerTool('docker', 'list_images', {
      description: 'List Docker images',
      parameters: {
        type: 'object',
        properties: {
          all: { type: 'boolean', description: 'Show all images', default: false }
        }
      },
      handler: async (params) => {
        return await this.toolHandlers.handleDockerTools('list_images', params);
      }
    });

    this.registerTool('docker', 'container_info', {
      description: 'Get detailed container information',
      parameters: {
        type: 'object',
        properties: {
          container_id: { type: 'string', description: 'Container ID or name' }
        },
        required: ['container_id']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleDockerTools('container_info', params);
      }
    });

    this.registerTool('docker', 'start_container', {
      description: 'Start a Docker container',
      parameters: {
        type: 'object',
        properties: {
          container_id: { type: 'string', description: 'Container ID or name' }
        },
        required: ['container_id']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleDockerTools('start_container', params);
      }
    });

    this.registerTool('docker', 'stop_container', {
      description: 'Stop a Docker container',
      parameters: {
        type: 'object',
        properties: {
          container_id: { type: 'string', description: 'Container ID or name' }
        },
        required: ['container_id']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleDockerTools('stop_container', params);
      }
    });

    this.registerTool('docker', 'remove_container', {
      description: 'Remove a Docker container',
      parameters: {
        type: 'object',
        properties: {
          container_id: { type: 'string', description: 'Container ID or name' },
          force: { type: 'boolean', description: 'Force removal', default: false }
        },
        required: ['container_id']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleDockerTools('remove_container', params);
      }
    });

    this.registerTool('docker', 'container_logs', {
      description: 'Get container logs',
      parameters: {
        type: 'object',
        properties: {
          container_id: { type: 'string', description: 'Container ID or name' },
          tail: { type: 'number', description: 'Number of lines to show from the end', default: 100 }
        },
        required: ['container_id']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleDockerTools('container_logs', params);
      }
    });

    this.registerTool('docker', 'pull_image', {
      description: 'Pull a Docker image',
      parameters: {
        type: 'object',
        properties: {
          image_name: { type: 'string', description: 'Image name (e.g., nginx:latest)' }
        },
        required: ['image_name']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleDockerTools('pull_image', params);
      }
    });

    /* Enhanced File System Tools */
    this.registerTool('filesystem', 'search_files', {
      description: 'Search for files by pattern (returns max 100 results by default)',
      parameters: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Directory to search in' },
          pattern: { type: 'string', description: 'File pattern (e.g., *.js, test*, C*)' },
          recursive: { type: 'boolean', description: 'Search recursively', default: true },
          maxResults: { type: 'number', description: 'Maximum number of results to return', default: 100 }
        },
        required: ['directory', 'pattern']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleFileSystemTools('search_files', params);
      }
    });

    this.registerTool('filesystem', 'get_file_stats', {
      description: 'Get file or directory statistics',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File or directory path' }
        },
        required: ['path']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleFileSystemTools('get_file_stats', params);
      }
    });

    this.registerTool('filesystem', 'create_directory', {
      description: 'Create a new directory',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path to create' },
          recursive: { type: 'boolean', description: 'Create parent directories', default: true }
        },
        required: ['path']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleFileSystemTools('create_directory', params);
      }
    });

    this.registerTool('filesystem', 'delete_file', {
      description: 'Delete a file or directory',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to delete' }
        },
        required: ['path']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleFileSystemTools('delete_file', params);
      }
    });

    this.registerTool('filesystem', 'copy_file', {
      description: 'Copy a file',
      parameters: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Source file path' },
          destination: { type: 'string', description: 'Destination file path' }
        },
        required: ['source', 'destination']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleFileSystemTools('copy_file', params);
      }
    });

    this.registerTool('filesystem', 'move_file', {
      description: 'Move or rename a file',
      parameters: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Source file path' },
          destination: { type: 'string', description: 'Destination file path' }
        },
        required: ['source', 'destination']
      },
      handler: async (params) => {
        return await this.toolHandlers.handleFileSystemTools('move_file', params);
      }
    });
  }

  // Register a tool for a specific connection type
  registerTool(connectionType, toolName, toolDefinition) {
    if (!this.tools.has(connectionType)) {
      this.tools.set(connectionType, new Map());
    }
    this.tools.get(connectionType).set(toolName, toolDefinition);
  }

  // Get tools available for a specific connection type
  getToolsForConnection(connectionType) {
    return this.tools.get(connectionType) || new Map();
  }

  // Get all registered tools
  getAllTools() {
    const allTools = {};
    for (const [connectionType, tools] of this.tools) {
      allTools[connectionType] = Object.fromEntries(tools);
    }
    return allTools;
  }

  // Execute a tool with given parameters
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

  // Get tool definition for a specific connection type and tool name
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

  // Get list of tool definitions for a connection type
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
