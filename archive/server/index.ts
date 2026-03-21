/**
 * NEO Server — 多端协同服务
 *
 * 功能:
 *   - REST API + WebSocket 实时同步
 *   - 用户认证 (JWT)
 *   - 任务看板 (个人 + 团队)
 *   - 实时消息推送
 *   - Agent 结果广播
 *
 * 启动: neo server [--port 3000]
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import { randomBytes, createHmac } from 'crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;     // base64 or URL
  signature?: string;  // personal bio
  agentName?: string;  // personal AI agent name
  createdAt: Date;
}

export interface TeamTask {
  id: string;
  title: string;
  description?: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigneeId?: string;
  reporterId: string;
  labels: string[];
  createdAt: Date;
  updatedAt: Date;
  dueAt?: Date;
}

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  type: 'text' | 'system' | 'agent';
  createdAt: Date;
}

interface WsClient {
  ws: WebSocket;
  userId?: string;
  rooms: Set<string>;
}

// ── In-memory store (replace with DB in production) ──────────────────────────

const users = new Map<string, User>();
const sessions = new Map<string, string>(); // token → userId
const teamTasks = new Map<string, TeamTask>();
const rooms = new Map<string, Set<string>>(); // roomId → Set<userId>
const messages = new Map<string, Message[]>(); // roomId → messages

// Seed demo user
const demoUser: User = {
  id: 'user-1',
  username: 'neo',
  displayName: 'NEO User',
  signature: 'Powered by AI',
  agentName: '小新',
  createdAt: new Date(),
};
users.set(demoUser.id, demoUser);

// Seed demo tasks
const demoTasks: TeamTask[] = [
  { id: 't1', title: '设计新 UI', description: '重构任务面板', status: 'in_progress', priority: 'high', reporterId: 'user-1', labels: ['ui', 'design'], createdAt: new Date(), updatedAt: new Date() },
  { id: 't2', title: '修复 streaming bug', status: 'todo', priority: 'urgent', reporterId: 'user-1', labels: ['bug'], createdAt: new Date(), updatedAt: new Date() },
  { id: 't3', title: '编写文档', status: 'backlog', priority: 'low', reporterId: 'user-1', labels: ['docs'], createdAt: new Date(), updatedAt: new Date() },
];
for (const t of demoTasks) teamTasks.set(t.id, t);

// ── JWT-lite (HMAC-SHA256, no external dep) ───────────────────────────────────

const JWT_SECRET = process.env['NEO_JWT_SECRET'] ?? randomBytes(32).toString('hex');

function signToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString('base64url');
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (sig !== expected) return null;
    return JSON.parse(Buffer.from(body ?? '', 'base64url').toString());
  } catch {
    return null;
  }
}

// ── HTTP Router ───────────────────────────────────────────────────────────────

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function getAuth(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const payload = verifyToken(token);
  return payload ? String(payload['userId'] ?? '') : null;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    });
    res.end();
    return;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  if (path === '/auth/login' && method === 'POST') {
    const body = await readBody(req);
    const username = String(body['username'] ?? '');
    const user = [...users.values()].find(u => u.username === username);
    if (!user) {
      // Auto-register
      const newUser: User = {
        id: `user-${Date.now()}`,
        username,
        displayName: username,
        createdAt: new Date(),
      };
      users.set(newUser.id, newUser);
      const token = signToken({ userId: newUser.id });
      json(res, 200, { token, user: newUser });
      return;
    }
    const token = signToken({ userId: user.id });
    json(res, 200, { token, user });
    return;
  }

  // ── Profile ───────────────────────────────────────────────────────────────
  if (path === '/me') {
    const userId = getAuth(req);
    if (!userId) { json(res, 401, { error: 'Unauthorized' }); return; }
    const user = users.get(userId);
    if (!user) { json(res, 404, { error: 'User not found' }); return; }
    if (method === 'GET') { json(res, 200, user); return; }
    if (method === 'PUT') {
      const body = await readBody(req);
      const updated = { ...user, ...body, id: user.id, createdAt: user.createdAt };
      users.set(userId, updated);
      json(res, 200, updated);
      return;
    }
  }

  // ── Team Tasks (Kanban) ───────────────────────────────────────────────────
  if (path.startsWith('/tasks')) {
    const userId = getAuth(req);
    if (!userId) { json(res, 401, { error: 'Unauthorized' }); return; }

    if (path === '/tasks' && method === 'GET') {
      const status = url.searchParams.get('status');
      const tasks = [...teamTasks.values()]
        .filter(t => !status || t.status === status)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      json(res, 200, tasks);
      return;
    }

    if (path === '/tasks' && method === 'POST') {
      const body = await readBody(req);
      const task: TeamTask = {
        id: `t-${Date.now()}`,
        title: String(body['title'] ?? 'Untitled'),
        description: body['description'] ? String(body['description']) : undefined,
        status: (body['status'] as TeamTask['status']) ?? 'todo',
        priority: (body['priority'] as TeamTask['priority']) ?? 'medium',
        assigneeId: body['assigneeId'] ? String(body['assigneeId']) : undefined,
        reporterId: userId,
        labels: Array.isArray(body['labels']) ? body['labels'].map(String) : [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      teamTasks.set(task.id, task);
      wssBroadcast({ type: 'task.created', data: task });
      json(res, 201, task);
      return;
    }

    const taskIdMatch = path.match(/^\/tasks\/(.+)$/);
    if (taskIdMatch) {
      const taskId = taskIdMatch[1] ?? '';
      const task = teamTasks.get(taskId);
      if (!task) { json(res, 404, { error: 'Task not found' }); return; }

      if (method === 'PUT') {
        const body = await readBody(req);
        const updated = { ...task, ...body, id: task.id, updatedAt: new Date() };
        teamTasks.set(taskId, updated);
        wssBroadcast({ type: 'task.updated', data: updated });
        json(res, 200, updated);
        return;
      }
      if (method === 'DELETE') {
        teamTasks.delete(taskId);
        wssBroadcast({ type: 'task.deleted', data: { id: taskId } });
        json(res, 200, { ok: true });
        return;
      }
      json(res, 200, task);
      return;
    }
  }

  // ── Messages ──────────────────────────────────────────────────────────────
  if (path.startsWith('/rooms')) {
    const userId = getAuth(req);
    if (!userId) { json(res, 401, { error: 'Unauthorized' }); return; }

    const roomMatch = path.match(/^\/rooms\/([^/]+)\/messages$/);
    if (roomMatch) {
      const roomId = roomMatch[1] ?? 'general';
      if (method === 'GET') {
        json(res, 200, (messages.get(roomId) ?? []).slice(-50));
        return;
      }
      if (method === 'POST') {
        const body = await readBody(req);
        const msg: Message = {
          id: `msg-${Date.now()}`,
          roomId,
          senderId: userId,
          content: String(body['content'] ?? ''),
          type: 'text',
          createdAt: new Date(),
        };
        if (!messages.has(roomId)) messages.set(roomId, []);
        messages.get(roomId)!.push(msg);
        wssBroadcast({ type: 'message', roomId, data: msg });
        json(res, 201, msg);
        return;
      }
    }
  }

  // ── Status ────────────────────────────────────────────────────────────────
  if (path === '/status') {
    json(res, 200, {
      name: 'NEO Server',
      version: '0.4.0',
      users: users.size,
      tasks: teamTasks.size,
      uptime: process.uptime(),
    });
    return;
  }

  json(res, 404, { error: 'Not found' });
}

// ── WebSocket Server ──────────────────────────────────────────────────────────

const wsClients = new Set<WsClient>();

let wss: WebSocketServer | null = null;

function wssBroadcast(payload: unknown, roomId?: string): void {
  const msg = JSON.stringify(payload);
  for (const client of wsClients) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;
    if (roomId && !client.rooms.has(roomId)) continue;
    client.ws.send(msg);
  }
}

function setupWss(server: ReturnType<typeof createServer>): void {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const client: WsClient = { ws, rooms: new Set(['general']) };
    wsClients.add(client);

    ws.send(JSON.stringify({ type: 'welcome', message: 'NEO Server connected' }));

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data)) as Record<string, unknown>;

        if (msg['type'] === 'auth') {
          const token = String(msg['token'] ?? '');
          const payload = verifyToken(token);
          if (payload) {
            client.userId = String(payload['userId'] ?? '');
            ws.send(JSON.stringify({ type: 'auth.ok', userId: client.userId }));
          }
          return;
        }

        if (msg['type'] === 'join') {
          const roomId = String(msg['roomId'] ?? 'general');
          client.rooms.add(roomId);
          return;
        }

        if (msg['type'] === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }
      } catch {
        // ignore malformed
      }
    });

    ws.on('close', () => wsClients.delete(client));
    ws.on('error', () => wsClients.delete(client));
  });
}

// ── Entry Point ───────────────────────────────────────────────────────────────

export interface ServerOptions {
  port?: number;
  host?: string;
}

export function startServer(opts: ServerOptions = {}): Promise<{ port: number; close: () => void }> {
  const port = opts.port ?? parseInt(process.env['NEO_PORT'] ?? '3000');
  const host = opts.host ?? '0.0.0.0';

  const server = createServer((req, res) => {
    void handleRequest(req, res).catch(err => {
      json(res, 500, { error: String(err) });
    });
  });

  setupWss(server);

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      console.log(`\n◆ NEO Server  http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
      console.log(`  WebSocket  ws://localhost:${port}/ws`);
      console.log(`  API        /auth/login  /tasks  /rooms/:id/messages\n`);
      resolve({
        port,
        close: () => server.close(),
      });
    });
  });
}
