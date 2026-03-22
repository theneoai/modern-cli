// Collaboration types for team workspace

export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';
export type TeamMemberRole = 'owner' | 'admin' | 'member' | 'guest';
export type ChannelType = 'public' | 'private' | 'direct';
export type MessageType = 'text' | 'agent' | 'system' | 'file';

export interface TeamSettings {
  allowGuestAccess: boolean;
  requireApproval: boolean;
  defaultChannelType: ChannelType;
  maxMembers: number;
  retentionDays: number;
  enableAgentCollaboration: boolean;
  agentAutoJoin: boolean;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  settings: TeamSettings;
}

export interface MemberNotificationPreferences {
  email: boolean;
  push: boolean;
  mention: boolean;
  workflow: boolean;
}

export interface MemberPreferences {
  notifications: MemberNotificationPreferences;
  theme: string;
  language: string;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  userName: string;
  role: TeamMemberRole;
  joinedAt: Date;
  lastActiveAt: Date;
  presence: PresenceStatus;
  preferences: MemberPreferences;
  isAgent: boolean;
  agentId?: string;
}

export interface ChannelSettings {
  allowThreads: boolean;
  allowReactions: boolean;
  allowFiles: boolean;
  allowAgentCommands: boolean;
  slowModeSeconds: number;
}

export interface Channel {
  id: string;
  teamId: string;
  name: string;
  displayName: string;
  type: ChannelType;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  members: string[];
  settings: ChannelSettings;
  topic?: string;
}

export interface Message {
  id: string;
  channelId: string;
  teamId: string;
  authorId: string;
  authorName: string;
  type: MessageType;
  content: string;
  createdAt: Date;
  reactions: string[];
  attachments: string[];
  mentions: string[];
  isAgent: boolean;
  agentId?: string;
  threadId?: string;
}

export interface WorkflowTrigger {
  type: 'schedule' | 'event' | 'manual';
  config: Record<string, unknown>;
}

export interface WorkflowPermissions {
  canEdit: string[];
  canExecute: string[];
  canView: string[];
}

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
  steps: unknown[];
  variables: Record<string, unknown>;
  permissions: WorkflowPermissions;
}
