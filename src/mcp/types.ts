/**
 * mcp/types.ts — MCP (Model Context Protocol) 核心类型
 */

export interface InputSchema {
  type: 'object';
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: InputSchema;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
}

export type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

export interface Skill {
  name: string;
  version: string;
  description: string;
  author?: string;
  tools: ToolDefinition[];
  handlers?: Record<string, ToolHandler>;
}
