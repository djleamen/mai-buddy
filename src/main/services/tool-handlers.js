/**
 * Tool Handlers for MCP Server
 * Provides implementations for various tool integrations
 * 
 * Author: DJ Leamen, 2025-2026
 */

const { Octokit } = require('@octokit/rest');
const Store = require('electron-store');
const Docker = require('dockerode');
const { Client: NotionClient } = require('@notionhq/client');
const { WebClient: SlackClient } = require('@slack/web-api');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * ToolHandlers class to manage various tool integrations.
 * Provides implementations for GitHub, Docker, Notion, Slack, and filesystem operations.
 */
class ToolHandlers {
  constructor() {
    /**
     * Creates a ToolHandlers instance.
     * Initializes storage and client instances for various services.
     */
    this.store = new Store();
    this.githubClient = null;
    this.dockerClient = null;
    this.notionClient = null;
    this.slackClient = null;
  }

  expandPath(filePath) {
    /**
     * Expands tilde (~) in file paths to the user's home directory.
     * 
     * @param {string} filePath - The file path to expand.
     * @returns {string} The expanded file path.
     */
    if (filePath.startsWith('~/')) {
      return path.join(os.homedir(), filePath.slice(2));
    }
    if (filePath === '~') {
      return os.homedir();
    }
    return filePath;
  }

  async initialize() {
    /**
     * Initializes the tool handlers.
     * 
     * @async
     * @returns {Promise<void>}
     */
    await this.initializeClients();
  }

  async initializeClients() {
    /**
     * Initializes all service clients (GitHub, Docker, Notion, Slack).
     * 
     * @async
     * @returns {Promise<void>}
     */
    await this.initializeGitHub();
    await this.initializeDocker();
    await this.initializeNotion();
    await this.initializeSlack();
  }

  async initializeGitHub() {
    /**
     * Initializes the GitHub Octokit client with stored token.
     * 
     * @async
     * @returns {Promise<void>}
     */
    const settings = this.store.get('settings', {});
    if (settings.githubToken) {
      this.githubClient = new Octokit({
        auth: settings.githubToken
      });
    }
  }

  async initializeDocker() {
    /**
     * Initializes the Docker client.
     * 
     * @async
     * @returns {Promise<void>}
     */
    try {
      this.dockerClient = new Docker();
      await this.dockerClient.ping();
    } catch (error) {
      console.log('Docker not available:', error.message);
      this.dockerClient = null;
    }
  }

  async initializeNotion() {
    /**
     * Initializes the Notion client with stored token.
     * 
     * @async
     * @returns {Promise<void>}
     */
    const settings = this.store.get('settings', {});
    if (settings.notionToken) {
      this.notionClient = new NotionClient({
        auth: settings.notionToken
      });
    }
  }

  async initializeSlack() {
    /**
     * Initializes the Slack client with stored token.
     * 
     * @async
     * @returns {Promise<void>}
     */
    const settings = this.store.get('settings', {});
    if (settings.slackToken) {
      this.slackClient = new SlackClient(settings.slackToken);
    }
  }

  async handleGitHubTools(toolName, parameters) {
    /**
     * Handles GitHub tool execution by routing to specific handlers.
     * 
     * @async
     * @param {string} toolName - The GitHub tool name to execute.
     * @param {Object} parameters - The parameters for the tool.
     * @returns {Promise<any>} The result of the tool execution.
     * @throws {Error} If GitHub not configured or tool unknown.
     */
    if (!this.githubClient) {
      throw new Error('GitHub not configured. Please set GitHub token in settings.');
    }

    switch (toolName) {
    case 'list_repositories':
      return await this.listRepositories(parameters);
    case 'create_issue':
      return await this.createIssue(parameters);
    case 'get_repository':
      return await this.getRepository(parameters);
    case 'list_issues':
      return await this.listIssues(parameters);
    case 'create_pull_request':
      return await this.createPullRequest(parameters);
    case 'search_code':
      return await this.searchCode(parameters);
    case 'get_user':
      return await this.getUser(parameters);
    case 'list_commits':
      return await this.listCommits(parameters);
    default:
      throw new Error(`Unknown GitHub tool: ${toolName}`);
    }
  }

  async listRepositories({ username, type = 'all', sort = 'updated', per_page = 30 }) {
    /**
     * Lists repositories for a GitHub user.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.username - GitHub username.
     * @param {string} [params.type='all'] - Repository type filter.
     * @param {string} [params.sort='updated'] - Sort order.
     * @param {number} [params.per_page=30] - Results per page.
     * @returns {Promise<Object>} Result object with success status and repositories.
     */
    try {
      const { data } = await this.githubClient.rest.repos.listForUser({
        username,
        type,
        sort,
        per_page
      });

      return {
        success: true,
        repositories: data.map(repo => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          description: repo.description,
          private: repo.private,
          html_url: repo.html_url,
          clone_url: repo.clone_url,
          language: repo.language,
          stargazers_count: repo.stargazers_count,
          forks_count: repo.forks_count,
          updated_at: repo.updated_at,
          created_at: repo.created_at
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async createIssue({ owner, repo, title, body, labels = [], assignees = [] }) {
    /**
     * Creates a new issue in a GitHub repository.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.owner - Repository owner.
     * @param {string} params.repo - Repository name.
     * @param {string} params.title - Issue title.
     * @param {string} params.body - Issue description.
     * @param {Array<string>} [params.labels=[]] - Issue labels.
     * @param {Array<string>} [params.assignees=[]] - Issue assignees.
     * @returns {Promise<Object>} Result object with success status and issue details.
     */
    try {
      const { data } = await this.githubClient.rest.issues.create({
        owner,
        repo,
        title,
        body,
        labels,
        assignees
      });

      return {
        success: true,
        issue: {
          id: data.id,
          number: data.number,
          title: data.title,
          body: data.body,
          state: data.state,
          html_url: data.html_url,
          created_at: data.created_at,
          user: data.user.login
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getRepository({ owner, repo }) {
    /**
     * Gets details of a GitHub repository.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.owner - Repository owner.
     * @param {string} params.repo - Repository name.
     * @returns {Promise<Object>} Result object with success status and repository details.
     */
    try {
      const { data } = await this.githubClient.rest.repos.get({
        owner,
        repo
      });

      return {
        success: true,
        repository: {
          id: data.id,
          name: data.name,
          full_name: data.full_name,
          description: data.description,
          private: data.private,
          html_url: data.html_url,
          clone_url: data.clone_url,
          language: data.language,
          stargazers_count: data.stargazers_count,
          forks_count: data.forks_count,
          open_issues_count: data.open_issues_count,
          default_branch: data.default_branch,
          created_at: data.created_at,
          updated_at: data.updated_at
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async listIssues({ owner, repo, state = 'open', sort = 'updated', per_page = 30 }) {
    /**
     * Lists issues in a GitHub repository.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.owner - Repository owner.
     * @param {string} params.repo - Repository name.
     * @param {string} [params.state='open'] - Issue state filter.
     * @param {string} [params.sort='updated'] - Sort order.
     * @param {number} [params.per_page=30] - Results per page.
     * @returns {Promise<Object>} Result object with success status and issues list.
     */
    try {
      const { data } = await this.githubClient.rest.issues.listForRepo({
        owner,
        repo,
        state,
        sort,
        per_page
      });

      return {
        success: true,
        issues: data.map(issue => ({
          id: issue.id,
          number: issue.number,
          title: issue.title,
          body: issue.body,
          state: issue.state,
          html_url: issue.html_url,
          created_at: issue.created_at,
          updated_at: issue.updated_at,
          user: issue.user.login,
          labels: issue.labels.map(label => label.name)
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async createPullRequest({ owner, repo, title, head, base, body = '' }) {
    /**
     * Creates a new pull request in a GitHub repository.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.owner - Repository owner.
     * @param {string} params.repo - Repository name.
     * @param {string} params.title - Pull request title.
     * @param {string} params.head - Branch to merge from.
     * @param {string} params.base - Branch to merge into.
     * @param {string} [params.body=''] - Pull request description.
     * @returns {Promise<Object>} Result object with success status and pull request details.
     */
    try {
      const { data } = await this.githubClient.rest.pulls.create({
        owner,
        repo,
        title,
        head,
        base,
        body
      });

      return {
        success: true,
        pull_request: {
          id: data.id,
          number: data.number,
          title: data.title,
          body: data.body,
          state: data.state,
          html_url: data.html_url,
          head: data.head.ref,
          base: data.base.ref,
          created_at: data.created_at,
          user: data.user.login
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async searchCode({ q, sort = 'indexed', order = 'desc', per_page = 30 }) {
    /**
     * Searches for code in GitHub repositories.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.q - Search query.
     * @param {string} [params.sort='indexed'] - Sort field.
     * @param {string} [params.order='desc'] - Sort order.
     * @param {number} [params.per_page=30] - Results per page.
     * @returns {Promise<Object>} Result object with success status and search results.
     */
    try {
      const { data } = await this.githubClient.rest.search.code({
        q,
        sort,
        order,
        per_page
      });

      return {
        success: true,
        total_count: data.total_count,
        items: data.items.map(item => ({
          name: item.name,
          path: item.path,
          sha: item.sha,
          html_url: item.html_url,
          repository: {
            name: item.repository.name,
            full_name: item.repository.full_name,
            html_url: item.repository.html_url
          }
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getUser({ username }) {
    /**
     * Gets details of a GitHub user.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.username - GitHub username.
     * @returns {Promise<Object>} Result object with success status and user details.
     */
    try {
      const { data } = await this.githubClient.rest.users.getByUsername({
        username
      });

      return {
        success: true,
        user: {
          id: data.id,
          login: data.login,
          name: data.name,
          bio: data.bio,
          company: data.company,
          location: data.location,
          email: data.email,
          html_url: data.html_url,
          avatar_url: data.avatar_url,
          public_repos: data.public_repos,
          followers: data.followers,
          following: data.following,
          created_at: data.created_at
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async listCommits({ owner, repo, sha, per_page = 30 }) {
    /**
     * Lists commits in a GitHub repository.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.owner - Repository owner.
     * @param {string} params.repo - Repository name.
     * @param {string} params.sha - Branch or commit SHA.
     * @param {number} [params.per_page=30] - Results per page.
     * @returns {Promise<Object>} Result object with success status and commits list.
     */
    try {
      const { data } = await this.githubClient.rest.repos.listCommits({
        owner,
        repo,
        sha,
        per_page
      });

      return {
        success: true,
        commits: data.map(commit => ({
          sha: commit.sha,
          message: commit.commit.message,
          author: {
            name: commit.commit.author.name,
            email: commit.commit.author.email,
            date: commit.commit.author.date
          },
          html_url: commit.html_url
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleDockerTools(toolName, parameters) {
    /**
     * Handles Docker tool execution by routing to specific handlers.
     * 
     * @async
     * @param {string} toolName - The Docker tool name to execute.
     * @param {Object} parameters - The parameters for the tool.
     * @returns {Promise<any>} The result of the tool execution.
     * @throws {Error} If Docker not configured or tool unknown.
     */
    if (!this.dockerClient) {
      throw new Error('Docker not available. Make sure Docker is running.');
    }

    switch (toolName) {
    case 'list_containers':
      return await this.listContainers(parameters);
    case 'list_images':
      return await this.listImages(parameters);
    case 'container_info':
      return await this.getContainerInfo(parameters);
    case 'start_container':
      return await this.startContainer(parameters);
    case 'stop_container':
      return await this.stopContainer(parameters);
    case 'remove_container':
      return await this.removeContainer(parameters);
    case 'container_logs':
      return await this.getContainerLogs(parameters);
    case 'pull_image':
      return await this.pullImage(parameters);
    default:
      throw new Error(`Unknown Docker tool: ${toolName}`);
    }
  }

  async listContainers({ all = false }) {
    /**
     * Lists Docker containers.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {boolean} [params.all=false] - Include stopped containers.
     * @returns {Promise<Object>} Result object with success status and containers list.
     */
    try {
      const containers = await this.dockerClient.listContainers({ all });
      return {
        success: true,
        containers: containers.map(container => ({
          id: container.Id,
          names: container.Names,
          image: container.Image,
          state: container.State,
          status: container.Status,
          ports: container.Ports,
          created: container.Created
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async listImages({ all = false }) {
    /**
     * Lists Docker images.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {boolean} [params.all=false] - Include dangling images.
     * @returns {Promise<Object>} Result object with success status and images list.
     */
    try {
      const images = await this.dockerClient.listImages({ all });
      return {
        success: true,
        images: images.map(image => ({
          id: image.Id,
          repo_tags: image.RepoTags,
          repo_digests: image.RepoDigests,
          size: image.Size,
          created: image.Created
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getContainerInfo({ container_id }) {
    /**
     * Gets detailed information about a Docker container.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.container_id - Container ID.
     * @returns {Promise<Object>} Result object with success status and container info.
     */
    try {
      const container = this.dockerClient.getContainer(container_id);
      const info = await container.inspect();
      return {
        success: true,
        info: {
          id: info.Id,
          name: info.Name,
          state: info.State,
          image: info.Config.Image,
          mounts: info.Mounts,
          network_settings: info.NetworkSettings
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async startContainer({ container_id }) {
    /**
     * Starts a Docker container.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.container_id - Container ID.
     * @returns {Promise<Object>} Result object with success status and message.
     */
    try {
      const container = this.dockerClient.getContainer(container_id);
      await container.start();
      return { success: true, message: `Container ${container_id} started` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async stopContainer({ container_id }) {
    /**
     * Stops a Docker container.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.container_id - Container ID.
     * @returns {Promise<Object>} Result object with success status and message.
     */
    try {
      const container = this.dockerClient.getContainer(container_id);
      await container.stop();
      return { success: true, message: `Container ${container_id} stopped` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async removeContainer({ container_id, force = false }) {
    /**
     * Removes a Docker container.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.container_id - Container ID.
     * @param {boolean} [params.force=false] - Force removal.
     * @returns {Promise<Object>} Result object with success status and message.
     */
    try {
      const container = this.dockerClient.getContainer(container_id);
      await container.remove({ force });
      return { success: true, message: `Container ${container_id} removed` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getContainerLogs({ container_id, tail = 100 }) {
    /**
     * Gets logs from a Docker container.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.container_id - Container ID.
     * @param {number} [params.tail=100] - Number of lines to retrieve.
     * @returns {Promise<Object>} Result object with success status and logs.
     */
    try {
      const container = this.dockerClient.getContainer(container_id);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: tail
      });
      return { success: true, logs: logs.toString() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async pullImage({ image_name }) {
    /**
     * Pulls a Docker image from a registry.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.image_name - Image name to pull.
     * @returns {Promise<Object>} Result object with success status and message.
     */
    try {
      return new Promise((resolve, reject) => {
        this.dockerClient.pull(image_name, (err, stream) => {
          if (err) {
            reject({ success: false, error: err.message });
            return;
          }
          
          this.dockerClient.modem.followProgress(stream, (err) => {
            if (err) {
              reject({ success: false, error: err.message });
            } else {
              resolve({ success: true, message: `Image ${image_name} pulled successfully` });
            }
          });
        });
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleFileSystemTools(toolName, parameters) {
    /**
     * Handles filesystem tool execution by routing to specific handlers.
     * 
     * @async
     * @param {string} toolName - The filesystem tool name to execute.
     * @param {Object} parameters - The parameters for the tool.
     * @returns {Promise<any>} The result of the tool execution.
     * @throws {Error} If tool unknown.
     */
    switch (toolName) {
    case 'search_files':
      return await this.searchFiles(parameters);
    case 'get_file_stats':
      return await this.getFileStats(parameters);
    case 'create_directory':
      return await this.createDirectory(parameters);
    case 'delete_file':
      return await this.deleteFile(parameters);
    case 'copy_file':
      return await this.copyFile(parameters);
    case 'move_file':
      return await this.moveFile(parameters);
    default:
      throw new Error(`Unknown FileSystem tool: ${toolName}`);
    }
  }

  async searchFiles({ directory, pattern, recursive = true, maxResults = 100 }) {
    /**
     * Searches for files in a directory by pattern.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.directory - Directory to search in.
     * @param {string} params.pattern - File pattern to match.
     * @param {boolean} [params.recursive=true] - Search recursively.
     * @param {number} [params.maxResults=100] - Maximum results to return.
     * @returns {Promise<Object>} Result object with success status and matched files.
     */
    try {
      const { globSync } = require('glob');
      const expandedDir = this.expandPath(directory);
      
      // For /Applications, only search top level (apps are not nested deep)
      // For other directories, respect the recursive parameter
      let searchPattern;
      let globOptions = { dot: true };
      
      if (expandedDir.includes('/Applications')) {
        // Always non-recursive for Applications - just search the immediate directory
        searchPattern = `${expandedDir}/${pattern}`;
        globOptions.maxDepth = 1;
      } else {
        // For other directories, use recursive parameter
        searchPattern = recursive ? `${expandedDir}/**/${pattern}` : `${expandedDir}/${pattern}`;
      }
      
      const files = globSync(searchPattern, globOptions);
      const totalCount = files.length;
      const limitedFiles = files.slice(0, maxResults);
      
      return { 
        success: true, 
        files: limitedFiles,
        total_count: totalCount,
        truncated: totalCount > maxResults,
        message: totalCount > maxResults ? 
          `Showing first ${maxResults} of ${totalCount} results. Use more specific patterns to see all.` : 
          undefined
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getFileStats({ path: filePath }) {
    /**
     * Gets file or directory statistics.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.path - File or directory path.
     * @returns {Promise<Object>} Result object with success status and file stats.
     */
    try {
      const expandedPath = this.expandPath(filePath);
      const stats = await fs.stat(expandedPath);
      return {
        success: true,
        stats: {
          size: stats.size,
          is_file: stats.isFile(),
          is_directory: stats.isDirectory(),
          created: stats.birthtime,
          modified: stats.mtime,
          accessed: stats.atime
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async createDirectory({ path: dirPath, recursive = true }) {
    /**
     * Creates a new directory.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.path - Directory path to create.
     * @param {boolean} [params.recursive=true] - Create parent directories if needed.
     * @returns {Promise<Object>} Result object with success status and message.
     */
    try {
      const expandedPath = this.expandPath(dirPath);
      await fs.mkdir(expandedPath, { recursive });
      return { success: true, message: `Directory created: ${expandedPath}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteFile({ path: filePath }) {
    /**
     * Deletes a file or directory.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.path - Path to file or directory to delete.
     * @returns {Promise<Object>} Result object with success status and message.
     */
    try {
      const expandedPath = this.expandPath(filePath);
      const stats = await fs.stat(expandedPath);
      if (stats.isDirectory()) {
        await fs.rm(expandedPath, { recursive: true });
      } else {
        await fs.unlink(expandedPath);
      }
      return { success: true, message: `Deleted: ${expandedPath}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async copyFile({ source, destination }) {
    /**
     * Creates a copy of a file.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.source - Source file path.
     * @param {string} params.destination - Destination file path.
     * @returns {Promise<Object>} Result object with success status and message.
     */
    try {
      const expandedSource = this.expandPath(source);
      const expandedDest = this.expandPath(destination);
      await fs.copyFile(expandedSource, expandedDest);
      return { success: true, message: `Copied ${expandedSource} to ${expandedDest}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async moveFile({ source, destination }) {
    /**
     * Moves a file to a new location.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.source - Source file path.
     * @param {string} params.destination - Destination file path.
     * @returns {Promise<Object>} Result object with success status and message.
     */
    try {
      const expandedSource = this.expandPath(source);
      const expandedDest = this.expandPath(destination);
      await fs.rename(expandedSource, expandedDest);
      return { success: true, message: `Moved ${expandedSource} to ${expandedDest}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleNotionTools(toolName, parameters) {
    /**
     * Handles Notion tool execution by routing to specific handlers.
     * 
     * @async
     * @param {string} toolName - The Notion tool name to execute.
     * @param {Object} parameters - The parameters for the tool.
     * @returns {Promise<any>} The result of the tool execution.
     * @throws {Error} If Notion not configured or tool unknown.
     */
    if (!this.notionClient) {
      throw new Error('Notion not configured. Please set Notion token in settings.');
    }

    switch (toolName) {
    case 'query_database':
      return await this.notionQueryDatabase(parameters);
    case 'create_page':
      return await this.notionCreatePage(parameters);
    case 'get_page':
      return await this.notionGetPage(parameters);
    case 'update_page':
      return await this.notionUpdatePage(parameters);
    case 'search':
      return await this.notionSearch(parameters);
    default:
      throw new Error(`Unknown Notion tool: ${toolName}`);
    }
  }

  async notionQueryDatabase({ database_id, filter, sorts }) {
    /**
     * Queries a Notion database.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.database_id - Database ID to query.
     * @param {Object} params.filter - Query filter.
     * @param {Array} params.sorts - Sort criteria.
     * @returns {Promise<Object>} Result object with success status and results.
     */
    try {
      const response = await this.notionClient.databases.query({
        database_id,
        filter,
        sorts
      });
      return {
        success: true,
        results: response.results.map(page => ({
          id: page.id,
          properties: page.properties,
          url: page.url,
          created_time: page.created_time
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async notionCreatePage({ parent, properties, children }) {
    /**
     * Creates a new page in Notion.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {Object} params.parent - Parent database or page.
     * @param {Object} params.properties - Page properties.
     * @param {Array} params.children - Page content blocks.
     * @returns {Promise<Object>} Result object with success status and page details.
     */
    try {
      const response = await this.notionClient.pages.create({
        parent,
        properties,
        children
      });
      return {
        success: true,
        page: {
          id: response.id,
          url: response.url,
          created_time: response.created_time
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async notionGetPage({ page_id }) {
    /**
     * Gets a Notion page by ID.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.page_id - Page ID to retrieve.
     * @returns {Promise<Object>} Result object with success status and page details.
     */
    try {
      const response = await this.notionClient.pages.retrieve({ page_id });
      return {
        success: true,
        page: {
          id: response.id,
          properties: response.properties,
          url: response.url,
          created_time: response.created_time
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async notionUpdatePage({ page_id, properties }) {
    /**
     * Updates a Notion page's properties.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.page_id - Page ID to update.
     * @param {Object} params.properties - Updated properties.
     * @returns {Promise<Object>} Result object with success status and page details.
     */
    try {
      const response = await this.notionClient.pages.update({
        page_id,
        properties
      });
      return {
        success: true,
        page: {
          id: response.id,
          properties: response.properties,
          url: response.url
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async notionSearch({ query, filter }) {
    /**
     * Searches for content in Notion workspace.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.query - Search query.
     * @param {Object} params.filter - Search filter criteria.
     * @returns {Promise<Object>} Result object with success status and search results.
     */
    try {
      const response = await this.notionClient.search({
        query,
        filter
      });
      return {
        success: true,
        results: response.results.map(item => ({
          id: item.id,
          object: item.object,
          url: item.url
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleSlackTools(toolName, parameters) {
    /**
     * Handles Slack tool execution by routing to specific handlers.
     * 
     * @async
     * @param {string} toolName - The Slack tool name to execute.
     * @param {Object} parameters - The parameters for the tool.
     * @returns {Promise<any>} The result of the tool execution.
     * @throws {Error} If Slack not configured or tool unknown.
     */
    if (!this.slackClient) {
      throw new Error('Slack not configured. Please set Slack token in settings.');
    }

    switch (toolName) {
    case 'send_message':
      return await this.slackSendMessage(parameters);
    case 'list_channels':
      return await this.slackListChannels(parameters);
    case 'get_channel_history':
      return await this.slackGetChannelHistory(parameters);
    case 'upload_file':
      return await this.slackUploadFile(parameters);
    case 'list_users':
      return await this.slackListUsers(parameters);
    default:
      throw new Error(`Unknown Slack tool: ${toolName}`);
    }
  }

  async slackSendMessage({ channel, text, thread_ts }) {
    /**
     * Sends a message to a Slack channel.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.channel - Channel ID.
     * @param {string} params.text - Message text.
     * @param {string} params.thread_ts - Thread timestamp for replies.
     * @returns {Promise<Object>} Result object with success status and message details.
     */
    try {
      const response = await this.slackClient.chat.postMessage({
        channel,
        text,
        thread_ts
      });
      return {
        success: true,
        message: {
          ts: response.ts,
          channel: response.channel
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async slackListChannels({ types = 'public_channel,private_channel' }) {
    /**
     * Lists Slack channels.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} [params.types='public_channel,private_channel'] - Channel types to list.
     * @returns {Promise<Object>} Result object with success status and channels list.
     */
    try {
      const response = await this.slackClient.conversations.list({
        types
      });
      return {
        success: true,
        channels: response.channels.map(channel => ({
          id: channel.id,
          name: channel.name,
          is_private: channel.is_private,
          is_archived: channel.is_archived,
          num_members: channel.num_members
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async slackGetChannelHistory({ channel, limit = 100 }) {
    /**
     * Gets message history from a Slack channel.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.channel - Channel ID.
     * @param {number} [params.limit=100] - Maximum messages to retrieve.
     * @returns {Promise<Object>} Result object with success status and messages.
     */
    try {
      const response = await this.slackClient.conversations.history({
        channel,
        limit
      });
      return {
        success: true,
        messages: response.messages.map(msg => ({
          type: msg.type,
          user: msg.user,
          text: msg.text,
          ts: msg.ts
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async slackUploadFile({ channels, file, filename, title }) {
    /**
     * Uploads a file to Slack channels.
     * 
     * @async
     * @param {Object} params - Parameters object.
     * @param {string} params.channels - Comma-separated channel IDs.
     * @param {Buffer} params.file - File data to upload.
     * @param {string} params.filename - File name.
     * @param {string} params.title - File title.
     * @returns {Promise<Object>} Result object with success status and file details.
     */
    try {
      const response = await this.slackClient.files.upload({
        channels,
        file,
        filename,
        title
      });
      return {
        success: true,
        file: {
          id: response.file.id,
          name: response.file.name,
          url_private: response.file.url_private
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async slackListUsers() {
    /**
     * Lists all users in the Slack workspace.
     * 
     * @async
     * @returns {Promise<Object>} Result object with success status and users list.
     */
    try {
      const response = await this.slackClient.users.list();
      return {
        success: true,
        users: response.members.map(user => ({
          id: user.id,
          name: user.name,
          real_name: user.real_name,
          is_bot: user.is_bot,
          deleted: user.deleted
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  setGitHubToken(token) {
    /**
     * Sets the GitHub API token and reinitializes the client.
     * 
     * @param {string} token - The GitHub API token.
     * @returns {void}
     * @throws {Error} If token is invalid.
     */
    if (typeof token !== 'string' || !token.trim()) {
      throw new Error('GitHub token must be a non-empty string.');
    }
    this.store.set('settings.githubToken', token);
    this.initializeGitHub();
  }
}

module.exports = { ToolHandlers };
