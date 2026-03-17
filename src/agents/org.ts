/**
 * Org Chart Orchestration
 *
 * Runs all agents within a company / department as a coordinated team,
 * following their reporting hierarchy for review/approval flows.
 *
 * Execution model:
 *   1. Individual contributors (no directReports) run in PARALLEL
 *   2. Their output flows UP to their manager(s)
 *   3. Managers synthesize subordinate output and pass up to directors
 *   4. Top-level agent (CEO/head) produces the final answer
 *
 * If no hierarchy exists, all agents in the unit run in parallel
 * and a built-in synthesizer merges results.
 */

import type { AgentPlan, AgentTask } from "./types.js";
import {
  getAgentsByCompany,
  getAgentsByDepartment,
  listCompanies,
  listDepartments,
  buildOrgTree,
  type CustomAgentDef,
  type OrgNode,
} from "./custom.js";

// ---------------------------------------------------------------------------
// Org-based plan construction
// ---------------------------------------------------------------------------

let _taskCounter = 0;
function nextId(): string { return `o${++_taskCounter}`; }

/**
 * Build an AgentPlan from an org unit (company or department).
 * Returns null if no agents are found.
 */
export function buildOrgPlan(
  company: string,
  department?: string,
  goal?: string
): AgentPlan | null {
  _taskCounter = 0;
  const agents = department
    ? getAgentsByDepartment(company, department)
    : getAgentsByCompany(company);

  if (agents.length === 0) return null;

  // Find top-level agents (no reportsTo within this unit)
  const unitNames = new Set(agents.map((a) => a.name));
  const topLevel = agents.filter(
    (a) => !a.org?.reportsTo || !unitNames.has(a.org.reportsTo)
  );

  // If no hierarchy, flat parallel execution + synthesizer
  if (agents.every((a) => !a.org?.reportsTo)) {
    const tasks: AgentTask[] = agents.map((a) => ({
      id: nextId(),
      role: a.name,
      prompt: goal
        ? `As the ${a.org?.title ?? a.name}, your task is: ${goal}`
        : `As the ${a.org?.title ?? a.name}, contribute your expertise.`,
    }));
    const allIds = tasks.map((t) => t.id);
    tasks.push({
      id: nextId(),
      role: "synthesizer",
      prompt: "Combine all agent outputs into a final answer.",
      dependsOn: allIds,
    });
    return { goal: goal ?? `${company} team task`, tasks, executionMode: "parallel" };
  }

  // Build hierarchical tasks bottom-up
  const taskMap = new Map<string, AgentTask>();
  const goalText = goal ?? `${company} team task`;

  function buildTasksFromTree(node: OrgNode, parentId?: string): AgentTask {
    const task: AgentTask = {
      id: nextId(),
      role: node.agent.name,
      prompt: `As the ${node.agent.org?.title ?? node.agent.name} at ${node.agent.org?.company ?? company}, ` +
        (parentId
          ? `review and synthesize the work from your team for: ${goalText}`
          : `complete your part of: ${goalText}`),
      dependsOn: undefined,
    };
    taskMap.set(node.agent.name, task);

    if (node.reports.length > 0) {
      const reportTasks = node.reports.map((r) => buildTasksFromTree(r));
      task.dependsOn = reportTasks.map((t) => t.id);
    }

    return task;
  }

  const tasks: AgentTask[] = [];
  for (const root of topLevel) {
    const tree = buildOrgTree(root.name);
    if (tree) tasks.push(...flattenTree(buildTasksFromTree(tree)));
  }

  return { goal: goalText, tasks, executionMode: "parallel" };
}

function flattenTree(root: AgentTask): AgentTask[] {
  // We need to return leaves before roots (topological order)
  // The tasks already have dependsOn set, so just collect all
  const all: AgentTask[] = [root];
  return all;
}

// ---------------------------------------------------------------------------
// Org chart display (ASCII tree)
// ---------------------------------------------------------------------------

export interface OrgDisplayOptions {
  showDescription?: boolean;
  showDepartment?: boolean;
  compact?: boolean;
}

export function renderOrgChart(company: string, opts: OrgDisplayOptions = {}): string {
  const agents = getAgentsByCompany(company);
  if (agents.length === 0) return `  (no agents in "${company}")\n`;

  const lines: string[] = [];
  lines.push(`  🏢 ${company}\n`);

  const departments = listDepartments(company);

  for (const dept of departments) {
    lines.push(`  ├── 🏬 ${dept}`);
    const deptAgents = getAgentsByDepartment(company, dept);

    // Find roots in this dept (no reportsTo or reportsTo is outside dept)
    const deptNames = new Set(deptAgents.map((a) => a.name));
    const roots = deptAgents.filter(
      (a) => !a.org?.reportsTo || !deptNames.has(a.org.reportsTo)
    );

    for (let i = 0; i < roots.length; i++) {
      const isLastRoot = i === roots.length - 1;
      const tree = buildOrgTree(roots[i]!.name);
      if (tree) {
        renderOrgNode(tree, `  │   `, isLastRoot, lines, opts);
      }
    }
    lines.push("  │");
  }

  // Agents with no department
  const noDept = agents.filter((a) => !a.org?.department);
  for (const a of noDept) {
    lines.push(`  └── ${a.icon} ${a.name} \u2014 ${a.description}`);
  }

  return lines.join("\n");
}

function renderOrgNode(
  node: OrgNode,
  prefix: string,
  isLast: boolean,
  lines: string[],
  opts: OrgDisplayOptions
): void {
  const a = node.agent;
  const connector = isLast ? "└──" : "├──";
  const title = a.org?.title ? ` (${a.org.title})` : "";
  const desc = opts.showDescription ? ` — ${a.description}` : "";
  lines.push(`${prefix}${connector} ${a.icon} ${a.name}${title}${desc}`);

  const childPrefix = prefix + (isLast ? "    " : "│   ");
  for (let i = 0; i < node.reports.length; i++) {
    renderOrgNode(
      node.reports[i]!,
      childPrefix,
      i === node.reports.length - 1,
      lines,
      opts
    );
  }
}

// ---------------------------------------------------------------------------
// Summary helpers
// ---------------------------------------------------------------------------

export function listAllCompanies(): string[] {
  return listCompanies();
}

export function getOrgStats(company: string): {
  totalAgents: number;
  departments: number;
  hasHierarchy: boolean;
} {
  const agents = getAgentsByCompany(company);
  const depts = new Set(agents.map((a) => a.org?.department).filter(Boolean));
  const hasHierarchy = agents.some((a) => (a.org?.reportsTo ?? (a.org?.directReports?.length ?? 0) > 0));
  return { totalAgents: agents.length, departments: depts.size, hasHierarchy };
}

/** Collect all agents for a flat company-wide parallel run (no hierarchy). */
export function getCompanyAgents(company: string): CustomAgentDef[] {
  return getAgentsByCompany(company);
}

export { listCompanies, listDepartments };
