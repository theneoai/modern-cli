/**
 * mcp/manager.ts — MCP 工具注册与调度
 *
 * - getActiveTools()    返回当前激活的所有工具列表 (for Anthropic tool_use)
 * - dispatchToolCall()  根据名称调用对应处理函数
 * - registerSkill()     注册外部插件技能
 */

import { BUILTIN_SKILLS } from './builtins.js';
import type { Skill, ToolDefinition, ToolResult } from './types.js';

// ── Registry ──────────────────────────────────────────────────────────────────

const registry = new Map<string, Skill>(Object.entries(BUILTIN_SKILLS));

export function registerSkill(skill: Skill): void {
  registry.set(skill.name, skill);
}

export function unregisterSkill(name: string): void {
  registry.delete(name);
}

// ── Tool API (used by anthropic-adapter) ──────────────────────────────────────

export interface ActiveTool extends ToolDefinition {
  skillName: string;
}

/** Returns flat list of all tools across all active skills */
export async function getActiveTools(): Promise<ActiveTool[]> {
  const tools: ActiveTool[] = [];
  for (const [, skill] of registry) {
    for (const tool of skill.tools) {
      tools.push({ ...tool, skillName: skill.name });
    }
  }
  return tools;
}

/** Dispatch a tool call by tool name, returns ToolResult */
export async function dispatchToolCall(
  toolName: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  for (const [, skill] of registry) {
    const tool = skill.tools.find(t => t.name === toolName);
    if (tool) {
      const handler = skill.handlers?.[toolName];
      if (!handler) return { content: `No handler for tool: ${toolName}`, isError: true };
      try {
        return await handler(input);
      } catch (e) {
        return { content: String(e), isError: true };
      }
    }
  }
  return { content: `Unknown tool: ${toolName}`, isError: true };
}
