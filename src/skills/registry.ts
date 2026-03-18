/**
 * Skill Registry - MCP-compatible skill system
 */

import { spawn } from 'child_process';
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { getDB, insert } from '../core/db/index.js';
import { events } from '../core/events/index.js';
import { getDataDir } from '../core/config/paths.js';
import type { Skill } from '../types/index.js';

// Built-in skills
const builtinSkills: Skill[] = [
  {
    id: 'builtin-shell',
    name: 'shell',
    version: '1.0.0',
    description: 'Execute shell commands safely',
    author: 'HyperTerminal',
    tags: ['system', 'execution'],
    inputSchema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    outputSchema: { type: 'object', properties: { stdout: { type: 'string' }, stderr: { type: 'string' } } },
    implementation: { type: 'javascript', code: 'executeShell' },
    permissions: [{ resource: 'system', action: 'execute' }],
    sandbox: { memory: 128, cpu: 5000, timeout: 30000, network: true, filesystem: 'readwrite' },
    enabled: true,
    createdAt: new Date(),
  },
  {
    id: 'builtin-file',
    name: 'file',
    version: '1.0.0',
    description: 'Read and write files',
    author: 'HyperTerminal',
    tags: ['filesystem', 'io'],
    inputSchema: { type: 'object', properties: { operation: { type: 'string' }, path: { type: 'string' } }, required: ['operation', 'path'] },
    outputSchema: { type: 'object', properties: { content: { type: 'string' }, success: { type: 'boolean' } } },
    implementation: { type: 'javascript', code: 'executeFile' },
    permissions: [{ resource: 'filesystem', action: 'read' }],
    sandbox: { memory: 64, cpu: 1000, timeout: 10000, network: false, filesystem: 'readwrite' },
    enabled: true,
    createdAt: new Date(),
  },
  {
    id: 'builtin-http',
    name: 'http',
    version: '1.0.0',
    description: 'Make HTTP requests',
    author: 'HyperTerminal',
    tags: ['network', 'api'],
    inputSchema: { type: 'object', properties: { url: { type: 'string' }, method: { type: 'string' } }, required: ['url'] },
    outputSchema: { type: 'object', properties: { status: { type: 'number' }, body: { type: 'string' } } },
    implementation: { type: 'javascript', code: 'executeHttp' },
    permissions: [{ resource: 'network', action: 'read' }],
    sandbox: { memory: 64, cpu: 5000, timeout: 30000, network: true, filesystem: 'none' },
    enabled: true,
    createdAt: new Date(),
  },
];

export function initSkills(): void {
  const db = getDB();
  const count = db.prepare('SELECT COUNT(*) as count FROM skills').get() as { count: number };
  
  if (count.count === 0) {
    for (const skill of builtinSkills) {
      insert('skills', {
        id: skill.id,
        name: skill.name,
        version: skill.version,
        description: skill.description,
        author: skill.author,
        tags: JSON.stringify(skill.tags),
        input_schema: JSON.stringify(skill.inputSchema),
        output_schema: JSON.stringify(skill.outputSchema),
        implementation: JSON.stringify(skill.implementation),
        enabled: skill.enabled ? 1 : 0,
      });
    }
  }
}

export function getSkill(idOrName: string): Skill | undefined {
  const db = getDB();
  let row = db.prepare('SELECT * FROM skills WHERE id = ?').get(idOrName) as any;
  if (!row) row = db.prepare('SELECT * FROM skills WHERE name = ?').get(idOrName) as any;
  if (!row) return undefined;
  return deserializeSkill(row);
}

export function listSkills(): Skill[] {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM skills').all() as any[];
  return rows.map(deserializeSkill);
}

export async function executeSkill(name: string, input: any): Promise<any> {
  const skill = getSkill(name);
  if (!skill) throw new Error(`Skill ${name} not found`);
  if (!skill.enabled) throw new Error(`Skill ${name} is disabled`);

  const startTime = Date.now();
  let result: any;

  if (skill.implementation.code === 'executeShell') {
    result = await executeShellCommand(input);
  } else if (skill.implementation.code === 'executeFile') {
    result = await executeFileOperation(input);
  } else if (skill.implementation.code === 'executeHttp') {
    result = await executeHttpRequest(input);
  } else {
    throw new Error('Unknown skill implementation');
  }

  events.emit('skill.executed', { skillName: name, input, output: result, duration: Date.now() - startTime });
  return result;
}

function executeShellCommand(input: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', input.command], { cwd: input.cwd || process.cwd(), timeout: input.timeout || 30000 });
    let stdout = '', stderr = '';
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('close', (code) => { resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code }); });
    child.on('error', reject);
  });
}

async function executeFileOperation(input: any): Promise<any> {
  const { operation, path: filePath, content } = input;
  const fullPath = join(getDataDir(), filePath);
  switch (operation) {
    case 'read':
      if (!existsSync(fullPath)) throw new Error(`File not found: ${filePath}`);
      return { content: await readFile(fullPath, 'utf-8'), success: true };
    case 'write':
      await mkdir(join(fullPath, '..'), { recursive: true });
      await writeFile(fullPath, content);
      return { success: true };
    case 'list':
      if (!existsSync(fullPath)) return { files: [], success: true };
      return { files: await readdir(fullPath), success: true };
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

async function executeHttpRequest(input: any): Promise<any> {
  const { url, method = 'GET', headers = {}, body } = input;
  const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: await response.text() };
}

function deserializeSkill(row: any): Skill {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    description: row.description,
    author: row.author,
    tags: JSON.parse(row.tags),
    inputSchema: JSON.parse(row.input_schema),
    outputSchema: JSON.parse(row.output_schema),
    implementation: JSON.parse(row.implementation),
    enabled: row.enabled === 1,
    createdAt: new Date(row.created_at),
  };
}
