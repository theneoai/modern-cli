/**
 * Collaboration Database Operations
 * 
 * 团队协作系统的数据库操作
 */

import { getDB } from '../core/db/index.js';
import type {
  Team,
  TeamMember,
  Channel,
  Message,
  TeamWorkflow,
  WorkflowExecution,
  PresenceUpdate,
  TeamSettings,
  MemberPreferences,
} from '../types/collaboration.js';

// ============================================================================
// 初始化数据库表
// ============================================================================

export function initCollaborationTables(): void {
  const db = getDB();

  // 团队表
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      avatar TEXT,
      owner_id TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch()),
      settings TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_teams_owner ON teams(owner_id);
  `);

  // 团队成员表
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_avatar TEXT,
      role TEXT DEFAULT 'member',
      joined_at INTEGER DEFAULT (unixepoch()),
      last_active_at INTEGER DEFAULT (unixepoch()),
      presence TEXT DEFAULT 'offline',
      preferences TEXT DEFAULT '{}',
      is_agent INTEGER DEFAULT 0,
      agent_id TEXT,
      UNIQUE(team_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
    CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_team_members_presence ON team_members(presence);
  `);

  // 频道表
  db.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      type TEXT DEFAULT 'public',
      created_by TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch()),
      members TEXT DEFAULT '[]',
      topic TEXT,
      is_archived INTEGER DEFAULT 0,
      settings TEXT DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_channels_team ON channels(team_id);
    CREATE INDEX IF NOT EXISTS idx_channels_name ON channels(name);
  `);

  // 消息表
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_avatar TEXT,
      type TEXT DEFAULT 'text',
      content TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER,
      edited INTEGER DEFAULT 0,
      reply_to TEXT,
      reactions TEXT DEFAULT '[]',
      attachments TEXT DEFAULT '[]',
      mentions TEXT DEFAULT '[]',
      is_agent INTEGER DEFAULT 0,
      agent_id TEXT,
      metadata TEXT DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
    CREATE INDEX IF NOT EXISTS idx_messages_team ON messages(team_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author_id);
  `);

  // 工作流表
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_workflows (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_by TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch()),
      is_active INTEGER DEFAULT 1,
      trigger TEXT DEFAULT '{}',
      steps TEXT DEFAULT '[]',
      variables TEXT DEFAULT '{}',
      permissions TEXT DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_workflows_team ON team_workflows(team_id);
    CREATE INDEX IF NOT EXISTS idx_workflows_active ON team_workflows(is_active);
  `);

  // 工作流执行表
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_executions (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      channel_id TEXT,
      triggered_by TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      context TEXT DEFAULT '{}',
      steps TEXT DEFAULT '[]',
      started_at INTEGER DEFAULT (unixepoch()),
      completed_at INTEGER,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_exec_workflow ON workflow_executions(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_exec_team ON workflow_executions(team_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_exec_status ON workflow_executions(status);
  `);

  // 用户会话表（用于在线状态）
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      socket_id TEXT,
      presence TEXT DEFAULT 'offline',
      last_ping INTEGER DEFAULT (unixepoch()),
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_team ON user_sessions(team_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_socket ON user_sessions(socket_id);
  `);
}

// ============================================================================
// 团队操作
// ============================================================================

export function createTeam(team: Omit<Team, 'createdAt' | 'updatedAt'>): Team {
  const db = getDB();
  const now = Date.now();
  
  db.prepare(`
    INSERT INTO teams (id, name, description, avatar, owner_id, created_at, updated_at, settings, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    team.id,
    team.name,
    team.description || null,
    team.avatar || null,
    team.ownerId,
    now,
    now,
    JSON.stringify(team.settings),
    JSON.stringify(team.metadata || {})
  );

  return { ...team, createdAt: new Date(now), updatedAt: new Date(now) };
}

export function getTeam(id: string): Team | undefined {
  const db = getDB();
  const row = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as any;
  
  if (!row) return undefined;
  
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    avatar: row.avatar,
    ownerId: row.owner_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    settings: JSON.parse(row.settings) as TeamSettings,
    metadata: JSON.parse(row.metadata),
  };
}

export function listTeams(userId?: string): Team[] {
  const db = getDB();
  
  let query = 'SELECT * FROM teams';
  let params: any[] = [];
  
  if (userId) {
    query = `
      SELECT t.* FROM teams t
      INNER JOIN team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = ?
    `;
    params = [userId];
  }
  
  const rows = db.prepare(query).all(...params) as any[];
  
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    avatar: row.avatar,
    ownerId: row.owner_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    settings: JSON.parse(row.settings) as TeamSettings,
    metadata: JSON.parse(row.metadata),
  }));
}

export function updateTeam(id: string, updates: Partial<Team>): Team | undefined {
  const db = getDB();
  const sets: string[] = [];
  const params: any[] = [];
  
  if (updates.name) { sets.push('name = ?'); params.push(updates.name); }
  if (updates.description !== undefined) { sets.push('description = ?'); params.push(updates.description); }
  if (updates.avatar !== undefined) { sets.push('avatar = ?'); params.push(updates.avatar); }
  if (updates.settings) { sets.push('settings = ?'); params.push(JSON.stringify(updates.settings)); }
  if (updates.metadata) { sets.push('metadata = ?'); params.push(JSON.stringify(updates.metadata)); }
  
  sets.push('updated_at = ?');
  params.push(Date.now());
  params.push(id);
  
  db.prepare(`UPDATE teams SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  
  return getTeam(id);
}

export function deleteTeam(id: string): boolean {
  const db = getDB();
  const result = db.prepare('DELETE FROM teams WHERE id = ?').run(id);
  return result.changes > 0;
}

// ============================================================================
// 成员操作
// ============================================================================

export function addTeamMember(member: Omit<TeamMember, 'joinedAt' | 'lastActiveAt'>): TeamMember {
  const db = getDB();
  const now = Date.now();
  
  db.prepare(`
    INSERT OR REPLACE INTO team_members 
    (id, team_id, user_id, user_name, user_avatar, role, joined_at, last_active_at, presence, preferences, is_agent, agent_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    member.id,
    member.teamId,
    member.userId,
    member.userName,
    member.userAvatar || null,
    member.role,
    now,
    now,
    member.presence,
    JSON.stringify(member.preferences),
    member.isAgent ? 1 : 0,
    member.agentId || null
  );
  
  return { ...member, joinedAt: new Date(now), lastActiveAt: new Date(now) };
}

export function getTeamMembers(teamId: string): TeamMember[] {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM team_members WHERE team_id = ?').all(teamId) as any[];
  
  return rows.map(row => ({
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    userName: row.user_name,
    userAvatar: row.user_avatar,
    role: row.role,
    joinedAt: new Date(row.joined_at),
    lastActiveAt: new Date(row.last_active_at),
    presence: row.presence,
    preferences: JSON.parse(row.preferences) as MemberPreferences,
    isAgent: !!row.is_agent,
    agentId: row.agent_id,
  }));
}

export function updateMemberPresence(teamId: string, userId: string, presence: PresenceUpdate): void {
  const db = getDB();
  db.prepare(`
    UPDATE team_members 
    SET presence = ?, last_active_at = ?
    WHERE team_id = ? AND user_id = ?
  `).run(presence.status, Date.now(), teamId, userId);
}

export function removeTeamMember(teamId: string, userId: string): boolean {
  const db = getDB();
  const result = db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(teamId, userId);
  return result.changes > 0;
}

// ============================================================================
// 频道操作
// ============================================================================

export function createChannel(channel: Omit<Channel, 'createdAt' | 'updatedAt'>): Channel {
  const db = getDB();
  const now = Date.now();
  
  db.prepare(`
    INSERT INTO channels (id, team_id, name, display_name, description, type, created_by, created_at, updated_at, members, topic, is_archived, settings)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    channel.id,
    channel.teamId,
    channel.name,
    channel.displayName,
    channel.description || null,
    channel.type,
    channel.createdBy,
    now,
    now,
    JSON.stringify(channel.members),
    channel.topic || null,
    channel.isArchived ? 1 : 0,
    JSON.stringify(channel.settings)
  );
  
  return { ...channel, createdAt: new Date(now), updatedAt: new Date(now) };
}

export function getChannel(id: string): Channel | undefined {
  const db = getDB();
  const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as any;
  
  if (!row) return undefined;
  
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    displayName: row.display_name,
    description: row.description,
    type: row.type,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    members: JSON.parse(row.members),
    topic: row.topic,
    isArchived: !!row.is_archived,
    settings: JSON.parse(row.settings),
  };
}

export function listChannels(teamId: string, userId?: string): Channel[] {
  const db = getDB();
  let query = 'SELECT * FROM channels WHERE team_id = ? AND is_archived = 0';
  let params: any[] = [teamId];
  
  if (userId) {
    query += ' AND (type = "public" OR members LIKE ?)';
    params.push(`%"${userId}"%`);
  }
  
  const rows = db.prepare(query).all(...params) as any[];
  
  return rows.map(row => ({
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    displayName: row.display_name,
    description: row.description,
    type: row.type,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    members: JSON.parse(row.members),
    topic: row.topic,
    isArchived: !!row.is_archived,
    settings: JSON.parse(row.settings),
  }));
}

export function addChannelMember(channelId: string, userId: string): void {
  const db = getDB();
  const channel = getChannel(channelId);
  if (!channel) return;
  
  const members = new Set([...channel.members, userId]);
  db.prepare('UPDATE channels SET members = ? WHERE id = ?')
    .run(JSON.stringify([...members]), channelId);
}

export function removeChannelMember(channelId: string, userId: string): void {
  const db = getDB();
  const channel = getChannel(channelId);
  if (!channel) return;
  
  const members = channel.members.filter(m => m !== userId);
  db.prepare('UPDATE channels SET members = ? WHERE id = ?')
    .run(JSON.stringify(members), channelId);
}

// ============================================================================
// 消息操作
// ============================================================================

export function createMessage(message: Omit<Message, 'createdAt' | 'updatedAt' | 'edited'>): Message {
  const db = getDB();
  const now = Date.now();
  
  db.prepare(`
    INSERT INTO messages (id, channel_id, team_id, author_id, author_name, author_avatar, type, content, created_at, reactions, attachments, mentions, is_agent, agent_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    message.id,
    message.channelId,
    message.teamId,
    message.authorId,
    message.authorName,
    message.authorAvatar || null,
    message.type,
    message.content,
    now,
    JSON.stringify(message.reactions || []),
    JSON.stringify(message.attachments || []),
    JSON.stringify(message.mentions || []),
    message.isAgent ? 1 : 0,
    message.agentId || null,
    JSON.stringify(message.metadata || {})
  );
  
  return { ...message, createdAt: new Date(now), edited: false };
}

export function getMessages(channelId: string, limit = 50, before?: Date): Message[] {
  const db = getDB();
  let query = 'SELECT * FROM messages WHERE channel_id = ?';
  let params: any[] = [channelId];
  
  if (before) {
    query += ' AND created_at < ?';
    params.push(before.getTime());
  }
  
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  
  const rows = db.prepare(query).all(...params) as any[];
  
  return rows.map(row => ({
    id: row.id,
    channelId: row.channel_id,
    teamId: row.team_id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorAvatar: row.author_avatar,
    type: row.type,
    content: row.content,
    createdAt: new Date(row.created_at),
    updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
    edited: !!row.edited,
    replyTo: row.reply_to,
    reactions: JSON.parse(row.reactions),
    attachments: JSON.parse(row.attachments),
    mentions: JSON.parse(row.mentions),
    isAgent: !!row.is_agent,
    agentId: row.agent_id,
    metadata: JSON.parse(row.metadata),
  })).reverse();
}

export function updateMessage(id: string, content: string): Message | undefined {
  const db = getDB();
  db.prepare(`
    UPDATE messages SET content = ?, edited = 1, updated_at = ? WHERE id = ?
  `).run(content, Date.now(), id);
  
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as any;
  if (!row) return undefined;
  
  return {
    id: row.id,
    channelId: row.channel_id,
    teamId: row.team_id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorAvatar: row.author_avatar,
    type: row.type,
    content: row.content,
    createdAt: new Date(row.created_at),
    updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
    edited: !!row.edited,
    replyTo: row.reply_to,
    reactions: JSON.parse(row.reactions),
    attachments: JSON.parse(row.attachments),
    mentions: JSON.parse(row.mentions),
    isAgent: !!row.is_agent,
    agentId: row.agent_id,
    metadata: JSON.parse(row.metadata),
  };
}

export function addReaction(messageId: string, emoji: string, userId: string): void {
  const db = getDB();
  const row = db.prepare('SELECT reactions FROM messages WHERE id = ?').get(messageId) as any;
  if (!row) return;
  
  const reactions = JSON.parse(row.reactions) as Array<{ emoji: string; users: string[] }>;
  const existing = reactions.find(r => r.emoji === emoji);
  
  if (existing) {
    if (!existing.users.includes(userId)) {
      existing.users.push(userId);
    }
  } else {
    reactions.push({ emoji, users: [userId] });
  }
  
  db.prepare('UPDATE messages SET reactions = ? WHERE id = ?')
    .run(JSON.stringify(reactions), messageId);
}

export function deleteMessage(id: string): boolean {
  const db = getDB();
  const result = db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  return result.changes > 0;
}

// ============================================================================
// 工作流操作
// ============================================================================

export function createWorkflow(workflow: Omit<TeamWorkflow, 'createdAt' | 'updatedAt'>): TeamWorkflow {
  const db = getDB();
  const now = Date.now();
  
  db.prepare(`
    INSERT INTO team_workflows (id, team_id, name, description, created_by, created_at, updated_at, is_active, trigger, steps, variables, permissions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    workflow.id,
    workflow.teamId,
    workflow.name,
    workflow.description || null,
    workflow.createdBy,
    now,
    now,
    workflow.isActive ? 1 : 0,
    JSON.stringify(workflow.trigger),
    JSON.stringify(workflow.steps),
    JSON.stringify(workflow.variables),
    JSON.stringify(workflow.permissions)
  );
  
  return { ...workflow, createdAt: new Date(now), updatedAt: new Date(now) };
}

export function getWorkflow(id: string): TeamWorkflow | undefined {
  const db = getDB();
  const row = db.prepare('SELECT * FROM team_workflows WHERE id = ?').get(id) as any;
  
  if (!row) return undefined;
  
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    description: row.description,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    isActive: !!row.is_active,
    trigger: JSON.parse(row.trigger),
    steps: JSON.parse(row.steps),
    variables: JSON.parse(row.variables),
    permissions: JSON.parse(row.permissions),
  };
}

export function listWorkflows(teamId: string): TeamWorkflow[] {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM team_workflows WHERE team_id = ?').all(teamId) as any[];
  
  return rows.map(row => ({
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    description: row.description,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    isActive: !!row.is_active,
    trigger: JSON.parse(row.trigger),
    steps: JSON.parse(row.steps),
    variables: JSON.parse(row.variables),
    permissions: JSON.parse(row.permissions),
  }));
}

export function updateWorkflow(id: string, updates: Partial<TeamWorkflow>): TeamWorkflow | undefined {
  const db = getDB();
  const sets: string[] = [];
  const params: any[] = [];
  
  if (updates.name) { sets.push('name = ?'); params.push(updates.name); }
  if (updates.description !== undefined) { sets.push('description = ?'); params.push(updates.description); }
  if (updates.isActive !== undefined) { sets.push('is_active = ?'); params.push(updates.isActive ? 1 : 0); }
  if (updates.trigger) { sets.push('trigger = ?'); params.push(JSON.stringify(updates.trigger)); }
  if (updates.steps) { sets.push('steps = ?'); params.push(JSON.stringify(updates.steps)); }
  if (updates.variables) { sets.push('variables = ?'); params.push(JSON.stringify(updates.variables)); }
  
  sets.push('updated_at = ?');
  params.push(Date.now());
  params.push(id);
  
  db.prepare(`UPDATE team_workflows SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  
  return getWorkflow(id);
}

export function deleteWorkflow(id: string): boolean {
  const db = getDB();
  const result = db.prepare('DELETE FROM team_workflows WHERE id = ?').run(id);
  return result.changes > 0;
}

// ============================================================================
// 工作流执行操作
// ============================================================================

export function createWorkflowExecution(execution: Omit<WorkflowExecution, 'startedAt'>): WorkflowExecution {
  const db = getDB();
  const now = Date.now();
  
  db.prepare(`
    INSERT INTO workflow_executions (id, workflow_id, team_id, channel_id, triggered_by, status, context, steps, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    execution.id,
    execution.workflowId,
    execution.teamId,
    execution.channelId || null,
    execution.triggeredBy,
    execution.status,
    JSON.stringify(execution.context),
    JSON.stringify(execution.steps),
    now
  );
  
  return { ...execution, startedAt: new Date(now) };
}

export function updateWorkflowExecution(id: string, updates: Partial<WorkflowExecution>): void {
  const db = getDB();
  const sets: string[] = [];
  const params: any[] = [];
  
  if (updates.status) { sets.push('status = ?'); params.push(updates.status); }
  if (updates.context) { sets.push('context = ?'); params.push(JSON.stringify(updates.context)); }
  if (updates.steps) { sets.push('steps = ?'); params.push(JSON.stringify(updates.steps)); }
  if (updates.completedAt) { sets.push('completed_at = ?'); params.push(updates.completedAt.getTime()); }
  if (updates.error !== undefined) { sets.push('error = ?'); params.push(updates.error); }
  
  params.push(id);
  
  db.prepare(`UPDATE workflow_executions SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

export function getWorkflowExecutions(workflowId: string, limit = 20): WorkflowExecution[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT * FROM workflow_executions 
    WHERE workflow_id = ? 
    ORDER BY started_at DESC 
    LIMIT ?
  `).all(workflowId, limit) as any[];
  
  return rows.map(row => ({
    id: row.id,
    workflowId: row.workflow_id,
    teamId: row.team_id,
    channelId: row.channel_id,
    triggeredBy: row.triggered_by,
    status: row.status,
    context: JSON.parse(row.context),
    steps: JSON.parse(row.steps),
    startedAt: new Date(row.started_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    error: row.error,
  }));
}
