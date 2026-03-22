/**
 * Human Team Collaboration Types
 * 
 * 人类团队协作系统类型定义
 * 支持多人多客户端接入、团队空间、自定义工作流
 */

// ============================================================================
// 基础类型
// ============================================================================

export type MemberRole = 'owner' | 'admin' | 'member' | 'guest';
export type ChannelType = 'public' | 'private' | 'direct';
export type MessageType = 'text' | 'file' | 'system' | 'workflow' | 'agent';
export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';
export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused';

// ============================================================================
// 团队相关
// ============================================================================

export interface Team {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  settings: TeamSettings;
  metadata?: Record<string, unknown>;
}

export interface TeamSettings {
  allowGuestAccess: boolean;
  requireApproval: boolean;
  defaultChannelType: ChannelType;
  maxMembers: number;
  retentionDays: number;
  enableAgentCollaboration: boolean;
  agentAutoJoin: boolean;
}

// ============================================================================
// 成员相关
// ============================================================================

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  role: MemberRole;
  joinedAt: Date;
  lastActiveAt: Date;
  presence: PresenceStatus;
  preferences: MemberPreferences;
  isAgent: boolean;
  agentId?: string;
}

export interface MemberPreferences {
  notifications: NotificationPreference;
  theme: 'light' | 'dark' | 'auto';
  language: string;
}

export interface NotificationPreference {
  email: boolean;
  push: boolean;
  mention: boolean;
  workflow: boolean;
}

// ============================================================================
// 频道相关
// ============================================================================

export interface Channel {
  id: string;
  teamId: string;
  name: string;
  displayName: string;
  description?: string;
  type: ChannelType;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  members: string[];
  topic?: string;
  isArchived: boolean;
  settings: ChannelSettings;
}

export interface ChannelSettings {
  allowThreads: boolean;
  allowReactions: boolean;
  allowFiles: boolean;
  allowAgentCommands: boolean;
  slowModeSeconds: number;
}

// ============================================================================
// 消息相关
// ============================================================================

export interface Message {
  id: string;
  channelId: string;
  teamId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  type: MessageType;
  content: string;
  createdAt: Date;
  updatedAt?: Date;
  edited: boolean;
  replyTo?: string;
  reactions: Reaction[];
  attachments: Attachment[];
  mentions: string[];
  isAgent: boolean;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface Reaction {
  emoji: string;
  users: string[];
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
}

// ============================================================================
// 工作流相关
// ============================================================================

export interface TeamWorkflow {
  id: string;
  teamId: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  variables: Record<string, WorkflowVariable>;
  permissions: WorkflowPermission;
}

export interface WorkflowTrigger {
  type: 'manual' | 'message' | 'schedule' | 'webhook' | 'event';
  config: Record<string, unknown>;
}

export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  type: 'human' | 'agent' | 'approval' | 'automation' | 'notification';
  assignee?: string;
  assigneeType: 'user' | 'role' | 'agent';
  config: Record<string, unknown>;
  dependencies: string[];
  timeout?: number;
  retryPolicy?: RetryPolicy;
}

export interface RetryPolicy {
  maxRetries: number;
  retryDelay: number;
  onFailure: 'skip' | 'notify' | 'halt';
}

export interface WorkflowVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  defaultValue?: unknown;
  required: boolean;
  description?: string;
}

export interface WorkflowPermission {
  canEdit: string[];
  canExecute: string[];
  canView: string[];
}

// ============================================================================
// 工作流执行相关
// ============================================================================

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  teamId: string;
  channelId?: string;
  triggeredBy: string;
  status: WorkflowStatus;
  context: WorkflowContext;
  steps: WorkflowStepExecution[];
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface WorkflowContext {
  variables: Record<string, unknown>;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface WorkflowStepExecution {
  stepId: string;
  status: WorkflowStatus;
  assignee?: string;
  startedAt?: Date;
  completedAt?: Date;
  output?: unknown;
  error?: string;
  logs: string[];
}

// ============================================================================
// 实时通信相关
// ============================================================================

export interface WebSocketMessage {
  type: 'message' | 'presence' | 'typing' | 'reaction' | 'workflow' | 'system';
  payload: unknown;
  timestamp: number;
  sender: string;
}

export interface PresenceUpdate {
  userId: string;
  status: PresenceStatus;
  channelId?: string;
  lastActive: Date;
}

export interface TypingIndicator {
  userId: string;
  channelId: string;
  isTyping: boolean;
}

// ============================================================================
// 客户端同步相关
// ============================================================================

export interface SyncState {
  clientId: string;
  userId: string;
  teamId: string;
  lastSyncAt: Date;
  channels: string[];
  unreadCounts: Record<string, number>;
  mentions: string[];
}

export interface SyncResult {
  messages: Message[];
  presence: PresenceUpdate[];
  workflows: WorkflowExecution[];
  deletedIds: string[];
}

// ============================================================================
// API 响应类型
// ============================================================================

export interface CreateTeamRequest {
  name: string;
  description?: string;
  ownerId: string;
}

export interface JoinTeamRequest {
  teamId: string;
  userId: string;
  userName: string;
  role?: MemberRole;
}

export interface CreateChannelRequest {
  teamId: string;
  name: string;
  displayName: string;
  type: ChannelType;
  members?: string[];
}

export interface SendMessageRequest {
  channelId: string;
  content: string;
  type?: MessageType;
  replyTo?: string;
  attachments?: Attachment[];
}

export interface CreateWorkflowRequest {
  teamId: string;
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
}
