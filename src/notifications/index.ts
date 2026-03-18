/**
 * Notification System - WebSocket-based real-time notifications
 */

import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';
import type { Agent } from '../types/index.js';

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'task' | 'message';
  title: string;
  body?: string;
  source: string;
  target?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  read: boolean;
  actions?: Array<{ label: string; action: string; payload?: any }>;
  metadata?: any;
  createdAt: Date;
  expiresAt?: Date;
}

export interface NotificationChannel {
  id: string;
  name: string;
  type: 'websocket' | 'email' | 'slack' | 'discord' | 'webhook';
  config: Record<string, any>;
  enabled: boolean;
}

// WebSocket server instance
let wss: WebSocketServer | null = null;
const clients = new Map<string, WebSocket>();
const agentSubscriptions = new Map<string, Set<string>>();

// Initialize WebSocket server
export function initNotificationServer(port: number = 8080): void {
  if (wss) return;

  wss = new WebSocketServer({ port });

  wss.on('connection', (ws: WebSocket, req: any) => {
    const clientId = uuidv4();
    const agentId = req.url?.split('?agent=')[1];

    clients.set(clientId, ws);
    
    if (agentId) {
      if (!agentSubscriptions.has(agentId)) {
        agentSubscriptions.set(agentId, new Set());
      }
      agentSubscriptions.get(agentId)!.add(clientId);
    }

    console.log(`🔌 Client connected: ${clientId}${agentId ? ` (agent: ${agentId})` : ''}`);

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(clientId, message);
      } catch (error) {
        ws.send(JSON.stringify({ error: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      clients.delete(clientId);
      if (agentId) {
        agentSubscriptions.get(agentId)?.delete(clientId);
      }
      console.log(`🔌 Client disconnected: ${clientId}`);
    });

    // Send welcome notification
    ws.send(JSON.stringify({
      type: 'connected',
      clientId,
      message: 'Connected to HyperTerminal notification server',
    }));
  });

  console.log(`🔔 Notification server started on port ${port}`);
  events.emit('notifications.server.started', { port });
}

// Handle client messages
function handleClientMessage(clientId: string, message: any): void {
  switch (message.type) {
    case 'subscribe':
      if (message.agentId) {
        if (!agentSubscriptions.has(message.agentId)) {
          agentSubscriptions.set(message.agentId, new Set());
        }
        agentSubscriptions.get(message.agentId)!.add(clientId);
      }
      break;

    case 'unsubscribe':
      if (message.agentId) {
        agentSubscriptions.get(message.agentId)?.delete(clientId);
      }
      break;

    case 'mark_read':
      markNotificationRead(message.notificationId);
      break;

    case 'action':
      handleNotificationAction(message.notificationId, message.action);
      break;
  }
}

// Send notification
export function sendNotification(notification: Omit<Notification, 'id' | 'createdAt'>): Notification {
  const notif: Notification = {
    ...notification,
    id: uuidv4(),
    createdAt: new Date(),
  };

  // Save to database
  const db = getDB();
  db.prepare(`
    INSERT INTO notifications (id, type, title, body, source, target, priority, read, actions, metadata, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    notif.id,
    notif.type,
    notif.title,
    notif.body,
    notif.source,
    notif.target,
    notif.priority,
    notif.read ? 1 : 0,
    JSON.stringify(notif.actions),
    JSON.stringify(notif.metadata),
    notif.createdAt.toISOString(),
    notif.expiresAt?.toISOString()
  );

  // Send to WebSocket clients
  if (notif.target && agentSubscriptions.has(notif.target)) {
    const clientIds = agentSubscriptions.get(notif.target)!;
    const message = JSON.stringify({ type: 'notification', data: notif });
    
    for (const clientId of clientIds) {
      const ws = clients.get(clientId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  // Broadcast to all if no target
  if (!notif.target) {
    const message = JSON.stringify({ type: 'notification', data: notif });
    for (const ws of clients.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  // Send to external channels
  sendToExternalChannels(notif);

  events.emit('notification.sent', { notificationId: notif.id, type: notif.type });
  return notif;
}

// Send to external channels
async function sendToExternalChannels(notification: Notification): Promise<void> {
  const db = getDB();
  const channels = db.prepare('SELECT * FROM notification_channels WHERE enabled = 1').all() as any[];

  for (const channel of channels) {
    try {
      switch (channel.type) {
        case 'slack':
          await sendSlackNotification(channel.config, notification);
          break;
        case 'discord':
          await sendDiscordNotification(channel.config, notification);
          break;
        case 'webhook':
          await sendWebhookNotification(channel.config, notification);
          break;
      }
    } catch (error) {
      console.error(`Failed to send to ${channel.name}:`, error);
    }
  }
}

// Slack integration
async function sendSlackNotification(config: any, notification: Notification): Promise<void> {
  const colorMap: Record<string, string> = {
    info: '#36a64f',
    success: '#36a64f',
    warning: '#ff9900',
    error: '#ff0000',
    task: '#0066cc',
    message: '#cccccc',
  };

  const payload = {
    attachments: [{
      color: colorMap[notification.type],
      title: notification.title,
      text: notification.body,
      footer: `HyperTerminal | ${notification.source}`,
      ts: Math.floor(Date.now() / 1000),
    }],
  };

  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Slack API error: ${response.statusText}`);
  }
}

// Discord integration
async function sendDiscordNotification(config: any, notification: Notification): Promise<void> {
  const colorMap: Record<string, number> = {
    info: 0x36a64f,
    success: 0x36a64f,
    warning: 0xff9900,
    error: 0xff0000,
    task: 0x0066cc,
    message: 0xcccccc,
  };

  const payload = {
    embeds: [{
      title: notification.title,
      description: notification.body,
      color: colorMap[notification.type],
      footer: { text: `HyperTerminal | ${notification.source}` },
      timestamp: new Date().toISOString(),
    }],
  };

  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Discord API error: ${response.statusText}`);
  }
}

// Generic webhook
async function sendWebhookNotification(config: any, notification: Notification): Promise<void> {
  const response = await fetch(config.url, {
    method: config.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...config.headers,
    },
    body: JSON.stringify(notification),
  });

  if (!response.ok) {
    throw new Error(`Webhook error: ${response.statusText}`);
  }
}

// Mark notification as read
export function markNotificationRead(id: string): void {
  const db = getDB();
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
  events.emit('notification.read', { notificationId: id });
}

// Get notifications for agent
export function getNotifications(agentId?: string, options: { unreadOnly?: boolean; limit?: number } = {}): Notification[] {
  const db = getDB();
  let sql = 'SELECT * FROM notifications WHERE 1=1';
  const params: any[] = [];

  if (agentId) {
    sql += ' AND (target = ? OR target IS NULL)';
    params.push(agentId);
  }

  if (options.unreadOnly) {
    sql += ' AND read = 0';
  }

  sql += ' ORDER BY created_at DESC';

  if (options.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map(deserializeNotification);
}

// Handle notification action
function handleNotificationAction(notificationId: string, action: string): void {
  events.emit('notification.action', { notificationId, action });
}

// Create notification channel
export function createNotificationChannel(data: Omit<NotificationChannel, 'id'>): NotificationChannel {
  const channel: NotificationChannel = {
    id: uuidv4(),
    ...data,
  };

  const db = getDB();
  db.prepare(`
    INSERT INTO notification_channels (id, name, type, config, enabled)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    channel.id,
    channel.name,
    channel.type,
    JSON.stringify(channel.config),
    channel.enabled ? 1 : 0
  );

  return channel;
}

// Subscribe to events and send notifications
events.on('agent.task.completed', (data: { agentId: string; taskId: string }) => {
  sendNotification({
    type: 'success',
    title: 'Task Completed',
    body: `Agent completed task ${data.taskId}`,
    source: 'agent',
    target: data.agentId,
    priority: 'low',
    read: false,
  });
});

events.on('workflow.completed', (data: { workflowId: string; result: any }) => {
  sendNotification({
    type: 'success',
    title: 'Workflow Completed',
    body: `Workflow executed successfully`,
    source: 'workflow',
    priority: 'medium',
    read: false,
    metadata: { workflowId: data.workflowId },
  });
});

events.on('economy.transaction', (data: { txId: string; amount: number; type: string }) => {
  sendNotification({
    type: 'info',
    title: 'Transaction Processed',
    body: `${data.type}: ${data.amount} HTC`,
    source: 'economy',
    priority: 'low',
    read: false,
  });
});

// Cleanup old notifications
export function cleanupOldNotifications(days: number = 30): number {
  const db = getDB();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare('DELETE FROM notifications WHERE created_at < ? AND read = 1').run(cutoff);
  return result.changes;
}

// Init tables
export function initNotificationTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      source TEXT NOT NULL,
      target TEXT,
      priority TEXT DEFAULT 'medium',
      read INTEGER DEFAULT 0,
      actions TEXT,
      metadata TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_target ON notifications(target);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
    CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

    CREATE TABLE IF NOT EXISTS notification_channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config TEXT NOT NULL,
      enabled INTEGER DEFAULT 1
    );
  `);
}

function deserializeNotification(row: any): Notification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    source: row.source,
    target: row.target,
    priority: row.priority,
    read: row.read === 1,
    actions: row.actions ? JSON.parse(row.actions) : undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    createdAt: new Date(row.created_at),
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
  };
}
