/**
 * MCP Skill types — aligned with Anthropic's tool_use schema.
 *
 * A "skill" is a named collection of tools that Claude can call.
 * Skills are installed locally and injected into API requests when enabled.
 */

export interface ToolInputSchema {
  type: "object";
  properties: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    items?: { type: string };
    [key: string]: unknown;
  }>;
  required?: string[];
  [key: string]: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
}

/** Result returned by a tool handler */
export interface ToolResult {
  content: string;
  isError?: boolean;
}

/** A handler function for a single tool */
export type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

/** Full skill definition including handlers */
export interface Skill {
  name: string;
  version: string;
  description: string;
  author?: string;
  tags?: string[];
  tools: ToolDefinition[];
  /** Map of tool name → handler. Missing = tool is declaration-only (Claude handles it). */
  handlers?: Record<string, ToolHandler>;
}

/** Serializable skill manifest stored in registry.json */
export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  tags?: string[];
  source: "builtin" | "npm" | "local";
  /** npm package name or local path */
  ref: string;
  enabled: boolean;
  installedAt: string;
  tools: string[];  // tool names only
}

/** Local skill registry file */
export interface SkillRegistry {
  version: 1;
  skills: Record<string, SkillManifest>;
  updatedAt: string;
}

/** Remote registry entry */
export interface RemoteSkillEntry {
  name: string;
  version: string;
  description: string;
  author?: string;
  tags?: string[];
  npmPackage?: string;
  downloadUrl?: string;
  tools: string[];
}

export interface RemoteRegistry {
  version: number;
  updatedAt: string;
  skills: RemoteSkillEntry[];
}
