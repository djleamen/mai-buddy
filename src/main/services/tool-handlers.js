/*
 * Tool Handlers for MCP connections
 * Provides actual implementations for GitHub and other services
 */

const { Octokit } = require('@octokit/rest');
const Store = require('electron-store');

class ToolHandlers {
  constructor() {
    this.store = new Store();
    this.githubClient = null;
    this.initializeClients();
  }

  async initializeClients() {
    await this.initializeGitHub();
  }

  async initializeGitHub() {
    const settings = this.store.get('settings', {});
    if (settings.githubToken) {
      this.githubClient = new Octokit({
        auth: settings.githubToken
      });
    }
  }

  // GitHub Tool Handlers
  async handleGitHubTools(toolName, parameters) {
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

  setGitHubToken(token) {
    if (typeof token !== 'string' || !token.trim()) {
      throw new Error('GitHub token must be a non-empty string.');
    }
    this.store.set('settings.githubToken', token);
    this.initializeGitHub();
  }
}

module.exports = { ToolHandlers };
