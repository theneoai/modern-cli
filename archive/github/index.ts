/**
 * GitHub Integration - PR review, issue management, repo operations
 */

import { getConfig } from '../core/config/index.js';
import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';
import { v4 as uuidv4 } from 'uuid';

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

export interface PullRequest {
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  user: string;
  createdAt: Date;
  updatedAt: Date;
  branch: string;
  baseBranch: string;
  additions: number;
  deletions: number;
  changedFiles: number;
}

export interface Issue {
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  labels: string[];
  user: string;
  assignees: string[];
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

// Get GitHub API token
function getGitHubToken(): string | undefined {
  return process.env.GITHUB_TOKEN || getConfig().github?.token;
}

// GitHub API request helper
async function githubAPI(path: string, options: RequestInit = {}): Promise<any> {
  const token = getGitHubToken();
  if (!token) throw new Error('GitHub token not configured');

  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'HyperTerminal',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`GitHub API error: ${error.message}`);
  }

  return response.json();
}

// List pull requests
export async function listPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<PullRequest[]> {
  const data = await githubAPI(`/repos/${owner}/${repo}/pulls?state=${state}`);
  return data.map((pr: any) => ({
    number: pr.number,
    title: pr.title,
    body: pr.body,
    state: pr.state,
    user: pr.user.login,
    createdAt: new Date(pr.created_at),
    updatedAt: new Date(pr.updated_at),
    branch: pr.head.ref,
    baseBranch: pr.base.ref,
    additions: pr.additions || 0,
    deletions: pr.deletions || 0,
    changedFiles: pr.changed_files || 0,
  }));
}

// Get PR details with diff
export async function getPullRequest(owner: string, repo: string, number: number): Promise<PullRequest & { diff?: string }> {
  const pr = await githubAPI(`/repos/${owner}/${repo}/pulls/${number}`);
  
  // Get diff
  const diffResponse = await fetch(pr.diff_url, {
    headers: { 'Accept': 'application/vnd.github.v3.diff' },
  });
  const diff = await diffResponse.text();

  return {
    number: pr.number,
    title: pr.title,
    body: pr.body,
    state: pr.state,
    user: pr.user.login,
    createdAt: new Date(pr.created_at),
    updatedAt: new Date(pr.updated_at),
    branch: pr.head.ref,
    baseBranch: pr.base.ref,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    diff,
  };
}

// AI-powered PR review
export async function reviewPullRequest(
  owner: string,
  repo: string,
  number: number,
  options: {
    checkSecurity?: boolean;
    checkPerformance?: boolean;
    checkStyle?: boolean;
  } = {}
): Promise<{ summary: string; comments: Array<{ file: string; line: number; comment: string; severity: 'info' | 'warning' | 'error' }> }> {
  const pr = await getPullRequest(owner, repo, number);

  if (!pr.diff) {
    return { summary: 'Could not retrieve diff', comments: [] };
  }

  // In real implementation, this would call an LLM
  // For now, return a template response
  const summary = `Review of PR #${number}: "${pr.title}"\n` +
    `Changed files: ${pr.changedFiles}, +${pr.additions}/-${pr.deletions}\n\n` +
    `Use "hyper github review submit ${owner} ${repo} ${number} <comment>" to submit review.`;

  // Parse diff for simple checks
  const comments: Array<{ file: string; line: number; comment: string; severity: 'info' | 'warning' | 'error' }> = [];
  
  if (options.checkSecurity && pr.diff.includes('password')) {
    comments.push({
      file: 'security-check',
      line: 0,
      comment: 'Potential password in code detected',
      severity: 'error',
    });
  }

  if (options.checkPerformance && pr.diff.includes('console.log')) {
    comments.push({
      file: 'performance-check',
      line: 0,
      comment: 'Consider removing console.log statements',
      severity: 'warning',
    });
  }

  // Save review to DB
  const db = getDB();
  db.prepare(`
    INSERT INTO github_reviews (id, owner, repo, pr_number, summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), owner, repo, number, summary, new Date().toISOString());

  events.emit('github.pr.reviewed', { owner, repo, number });

  return { summary, comments };
}

// Submit review comment
export async function submitReviewComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  options: { event?: 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES' } = {}
): Promise<void> {
  await githubAPI(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      body,
      event: options.event || 'COMMENT',
    }),
  });

  events.emit('github.review.submitted', { owner, repo, prNumber });
}

// List issues
export async function listIssues(
  owner: string,
  repo: string,
  filters: { state?: 'open' | 'closed' | 'all'; labels?: string[]; assignee?: string } = {}
): Promise<Issue[]> {
  let url = `/repos/${owner}/${repo}/issues?state=${filters.state || 'open'}`;
  if (filters.labels?.length) url += `&labels=${filters.labels.join(',')}`;
  if (filters.assignee) url += `&assignee=${filters.assignee}`;

  const data = await githubAPI(url);
  return data.map((issue: any) => ({
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    labels: issue.labels.map((l: any) => l.name),
    user: issue.user.login,
    assignees: issue.assignees.map((a: any) => a.login),
    createdAt: new Date(issue.created_at),
    updatedAt: new Date(issue.updated_at),
    closedAt: issue.closed_at ? new Date(issue.closed_at) : undefined,
  }));
}

// Create issue
export async function createIssue(
  owner: string,
  repo: string,
  title: string,
  body: string,
  options: { labels?: string[]; assignees?: string[] } = {}
): Promise<Issue> {
  const issue = await githubAPI(`/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      body,
      labels: options.labels,
      assignees: options.assignees,
    }),
  });

  events.emit('github.issue.created', { owner, repo, number: issue.number });

  return {
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    labels: issue.labels.map((l: any) => l.name),
    user: issue.user.login,
    assignees: issue.assignees.map((a: any) => a.login),
    createdAt: new Date(issue.created_at),
    updatedAt: new Date(issue.updated_at),
  };
}

// Close issue
export async function closeIssue(owner: string, repo: string, number: number): Promise<void> {
  await githubAPI(`/repos/${owner}/${repo}/issues/${number}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: 'closed' }),
  });

  events.emit('github.issue.closed', { owner, repo, number });
}

// AI-generated issue from error
export async function createIssueFromError(
  owner: string,
  repo: string,
  error: Error,
  context: { component?: string; version?: string; logs?: string }
): Promise<Issue> {
  const title = `[Bug] ${error.message.slice(0, 100)}`;
  const body = `## Error Report

**Error:** ${error.message}

**Stack Trace:**
\`\`\`
${error.stack}
\`\`\`

**Context:**
- Component: ${context.component || 'Unknown'}
- Version: ${context.version || 'Unknown'}

**Logs:**
\`\`\`
${context.logs || 'No logs available'}
\`\`\`

---
*This issue was auto-generated by HyperTerminal*`;

  return createIssue(owner, repo, title, body, { labels: ['bug', 'auto-generated'] });
}

// Repository stats
export async function getRepoStats(owner: string, repo: string): Promise<{
  stars: number;
  forks: number;
  openIssues: number;
  language: string;
}> {
  const data = await githubAPI(`/repos/${owner}/${repo}`);
  return {
    stars: data.stargazers_count,
    forks: data.forks_count,
    openIssues: data.open_issues_count,
    language: data.language,
  };
}

// Initialize tables
export function initGitHubTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS github_reviews (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      summary TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_github_reviews ON github_reviews(owner, repo, pr_number);
  `);
}

// Webhook handler (for receiving GitHub events)
export function handleWebhook(payload: any): void {
  const event = payload.headers?.['x-github-event'];
  
  switch (event) {
    case 'pull_request':
      if (payload.action === 'opened') {
        events.emit('github.webhook.pr.opened', {
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          number: payload.pull_request.number,
        });
      }
      break;

    case 'issues':
      if (payload.action === 'opened') {
        events.emit('github.webhook.issue.opened', {
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          number: payload.issue.number,
        });
      }
      break;
  }
}
