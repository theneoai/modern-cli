/**
 * Organization System - Manage companies, teams, and social structures
 */

import { v4 as uuidv4 } from 'uuid';
import { getDB, insert, selectOne, selectAll, remove } from '../core/db/index.js';
import { events } from '../core/events/index.js';
import type { Organization, SocialRelation } from '../types/index.js';

// Organization CRUD
export function createOrganization(data: {
  name: string;
  type: Organization['type'];
  description?: string;
  config?: Partial<Organization['config']>;
}): Organization {
  const org: Organization = {
    id: uuidv4(),
    name: data.name,
    type: data.type,
    description: data.description,
    config: {
      values: [],
      culture: 'flat',
      ...data.config,
    },
    economy: {
      currency: 'HTC',
      budget: 10000,
      revenue: 0,
      expenses: 0,
      salaryBaseline: 100,
    },
    createdAt: new Date(),
  };

  insert('organizations', {
    id: org.id,
    name: org.name,
    type: org.type,
    description: org.description,
    config: JSON.stringify(org.config),
    economy: JSON.stringify(org.economy),
  });

  events.emit('org.created', { orgId: org.id, name: org.name, type: org.type });
  
  return org;
}

export function getOrganization(id: string): Organization | undefined {
  const row = selectOne<any>('organizations', id);
  if (!row) return undefined;
  
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    config: JSON.parse(row.config),
    economy: JSON.parse(row.economy),
    createdAt: new Date(row.created_at),
  };
}

export function listOrganizations(): Organization[] {
  const rows = selectAll<any>('organizations');
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    config: JSON.parse(row.config),
    economy: JSON.parse(row.economy),
    createdAt: new Date(row.created_at),
  }));
}

export function deleteOrganization(id: string): boolean {
  const org = getOrganization(id);
  if (!org) return false;
  
  remove('organizations', id);
  return true;
}

// Agent membership
export function addAgentToOrg(
  agentId: string, 
  orgId: string, 
  data: { 
    department?: string; 
    role?: string; 
    reportsTo?: string;
    salary?: number;
  }
): void {
  const db = getDB();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO agent_org (agent_id, org_id, department, role, reports_to, salary)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(agentId, orgId, data.department, data.role, data.reportsTo, data.salary || 0);
  
  events.emit('org.member.joined', { 
    orgId, 
    agentId, 
    role: data.role || 'member' 
  });
}

export function removeAgentFromOrg(agentId: string, orgId: string): void {
  const db = getDB();
  const stmt = db.prepare('DELETE FROM agent_org WHERE agent_id = ? AND org_id = ?');
  stmt.run(agentId, orgId);
  
  events.emit('org.member.left', { orgId, agentId });
}

export function getOrgMembers(orgId: string): Array<{
  agentId: string;
  department?: string;
  role?: string;
  reportsTo?: string;
  salary: number;
}> {
  const db = getDB();
  const stmt = db.prepare('SELECT * FROM agent_org WHERE org_id = ?');
  const rows = stmt.all(orgId) as any[];
  
  return rows.map(row => ({
    agentId: row.agent_id,
    department: row.department,
    role: row.role,
    reportsTo: row.reports_to,
    salary: row.salary,
  }));
}

// Social relations
export function setRelation(
  fromAgentId: string,
  toAgentId: string,
  type: SocialRelation['type'],
  strength: number
): void {
  const db = getDB();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO social_relations (from_agent, to_agent, type, strength, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  
  stmt.run(fromAgentId, toAgentId, type, Math.max(-1, Math.min(1, strength)));
  
  events.emit('social.relation.formed', { 
    from: fromAgentId, 
    to: toAgentId, 
    type, 
    strength 
  });
}

export function getRelations(agentId: string): SocialRelation[] {
  const db = getDB();
  const stmt = db.prepare('SELECT * FROM social_relations WHERE from_agent = ? OR to_agent = ?');
  const rows = stmt.all(agentId, agentId) as any[];
  
  return rows.map(row => ({
    fromAgentId: row.from_agent,
    toAgentId: row.to_agent,
    type: row.type,
    strength: row.strength,
    interactions: row.interactions || 0,
    lastInteraction: row.last_interaction ? new Date(row.last_interaction) : new Date(),
  }));
}

// Org chart visualization
export function generateOrgChart(orgId: string): string {
  const org = getOrganization(orgId);
  if (!org) return 'Organization not found';
  
  const members = getOrgMembers(orgId);
  if (members.length === 0) return `${org.name}\n(No members)`;
  
  let output = `🏢 ${org.name}\n`;
  output += `   ${org.description || ''}\n\n`;
  
  // Group by department
  const byDept: Record<string, typeof members> = {};
  for (const m of members) {
    const dept = m.department || 'Unassigned';
    if (!byDept[dept]) byDept[dept] = [];
    byDept[dept].push(m);
  }
  
  for (const [dept, agents] of Object.entries(byDept)) {
    output += `📂 ${dept}\n`;
    for (const a of agents) {
      output += `   ${a.role ? `(${a.role})` : '👤'} → Agent ${a.agentId.slice(0, 8)}\n`;
    }
    output += '\n';
  }
  
  return output;
}
