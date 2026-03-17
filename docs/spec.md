# modern-ai-cli — Technical Specification

**Package:** `modern-ai-cli`
**Version:** 0.1.0
**Binary:** `ai`
**License:** MIT
**Runtime:** Node.js ≥ 18, ESM

---

## 1. Overview

`modern-ai-cli` is a TypeScript-based command-line interface that exposes Anthropic's Claude API as a terminal tool. It supports single-shot questions, interactive multi-turn chat, code generation, multi-agent task orchestration, MCP (Model Context Protocol) skill extensions, and a plugin system.

---

## 2. Technology Stack

| Layer | Library |
|---|---|
| CLI framework | `commander` v13 |
| Interactive prompts | `@clack/prompts` v0.9 |
| AI backend | `@anthropic-ai/sdk` v0.55 |
| Styling | `chalk` v5, `ora` v8, `figures` v6 |
| Markdown rendering | `marked` v15 + `marked-terminal` v7 |
| Persistent config | `conf` v13 |
| Build | `tsup` v8 (ESM output) |
| Tests | `jest` v29 + `ts-jest` |
| Release | `semantic-release` + `commitlint` |
| Binary bundling | `@yao-pkg/pkg` (Node 20 targets) |

---

## 3. Architecture

```
src/
├── index.ts          Entry point — boots CLI, checks for updates
├── cli.ts            Registers all commands via Commander
├── version.ts        Embedded version metadata
│
├── commands/         One file per top-level command
│   ├── ask.ts        ai ask
│   ├── chat.ts       ai chat
│   ├── generate.ts   ai generate
│   ├── config.ts     ai config
│   ├── whatsnew.ts   ai whatsnew
│   ├── mcp.ts        ai mcp
│   ├── plugin.ts     ai plugin
│   └── agent.ts      ai agent (+ sub-trees: workflow, org, memory, meet)
│
├── ai/
│   ├── client.ts     Anthropic SDK wrapper; streaming + tool-use loop
│   └── prompts.ts    System prompt library + generate prompt builder
│
├── agents/
│   ├── types.ts      AgentRole, AgentPlan, AgentTask, AgentEvent types
│   ├── orchestrator.ts  Task planning & execution engine
│   ├── custom.ts     Custom agent CRUD (persisted via conf)
│   ├── workflow.ts   Reusable workflow management + built-in templates
│   ├── org.ts        Org-chart model (companies / departments)
│   └── memory.ts     Per-agent + shared memory store (episodic/semantic/procedural/working)
│   └── meeting.ts    Multi-agent structured meeting engine
│
├── mcp/
│   ├── types.ts      SkillManifest, ToolDefinition types
│   ├── manager.ts    Skill registry, enable/disable, tool dispatch
│   ├── registry.ts   Remote skill registry search
│   └── builtins.ts   Built-in skills: shell, files, http, calculator
│
├── plugins/
│   └── loader.ts     Dynamic plugin loading (npm-installed Commander extensions)
│
├── ui/
│   ├── theme.ts      Colour palette, icons, formatters
│   ├── spinner.ts    ora-based spinners (thinkingSpinner, createSpinner, withSpinner)
│   ├── output.ts     printMessage, printUsage, divider, renderMarkdown
│   ├── agent-board.ts  Live multi-agent progress board
│   └── meeting-board.ts Live meeting turn display
│
└── utils/
    ├── config.ts     Conf-backed config store (getConfig / setConfig / resetConfig)
    ├── history.ts    Chat session persistence (createSession / saveSession / loadSession)
    └── upgrade-notifier.ts  Background npm update check
```

---

## 4. Configuration

Stored via `conf` under the `modern-ai-cli` project namespace. File path shown by `ai config path`.

| Key | Type | Default | Description |
|---|---|---|---|
| `apiKey` | string | — | Anthropic API key (falls back to `ANTHROPIC_API_KEY` env) |
| `model` | enum | `claude-opus-4-6` | Active Claude model |
| `maxTokens` | number | `4096` | Maximum output tokens per request |
| `systemPrompt` | string | default prompt | Global system prompt override |
| `streamingEnabled` | boolean | `true` | Use streaming responses by default |
| `historyEnabled` | boolean | `true` | Auto-save chat sessions |
| `historyMaxMessages` | number | `20` | Messages retained in chat context window |
| `theme` | `"dark"\|"light"` | `"dark"` | UI colour theme |

**Valid models:** `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`

---

## 5. Commands

### 5.1 `ai ask <question...>`

Ask Claude a single question and receive a response.

**Alias:** `a`

**Options:**

| Flag | Default | Description |
|---|---|---|
| `-m, --mode <mode>` | `default` | Prompt mode (see §6) |
| `-s, --system <prompt>` | — | Override system prompt |
| `--no-stream` | — | Disable streaming |
| `--no-usage` | — | Hide token usage stats |

**Behaviour:**
- Streams response by default when `streamingEnabled` is true.
- Displays model name and stop reason in footer.
- Automatically includes tools from enabled MCP skills.

---

### 5.2 `ai chat`

Start an interactive multi-turn chat session.

**Alias:** `c`

**Options:**

| Flag | Default | Description |
|---|---|---|
| `-m, --mode <mode>` | `default` | Initial prompt mode |
| `-s, --system <prompt>` | — | Override system prompt |
| `--session <id>` | — | Resume a saved session |

**Slash commands available inside chat:**

| Command | Description |
|---|---|
| `/clear` | Clear conversation history |
| `/mode` | Interactively switch AI mode |
| `/history` | Print the current conversation |
| `/save` | Save session to disk |
| `/load` | Load a saved session |
| `/usage` | Toggle token usage display |
| `/model` | Show current model |
| `/help` | Show slash command list |
| `/exit` | Exit the chat |

**Session auto-save:** Every 5 turns when `historyEnabled` is true. Sessions are also saved on exit.

---

### 5.3 `ai generate [description]`

AI-powered code and content generation.

**Aliases:** `gen`, `g`

**Options:**

| Flag | Description |
|---|---|
| `-t, --type <type>` | `component \| function \| test \| docs \| script` |
| `-l, --language <lang>` | Target language (e.g. TypeScript, Python) |
| `-o, --output <file>` | Write generated content to file |
| `--no-explain` | Output code only, skip explanation |

**Generate types and their behaviour:**

| Type | Generates |
|---|---|
| `component` | UI component with props, implementation, usage example, JSDoc |
| `function` | Typed function with error handling, unit tests, JSDoc |
| `test` | Test suite covering happy path, edge cases, errors |
| `docs` | Documentation / README with overview, API reference, examples |
| `script` | Shell/automation script with shebang, error handling, comments |

If `--output` is specified and the file already exists, the user is prompted to confirm overwrite. Code is extracted from markdown fences before writing.

---

### 5.4 `ai config`

Manage CLI configuration.

**Subcommands:**

| Subcommand | Description |
|---|---|
| `show` / `list` | Print all current config values |
| `set <key> <value>` | Set a single config key |
| `wizard` / `setup` | Interactive first-time setup |
| `reset [-f]` | Reset all config to defaults |
| `path` | Print the config file path |

---

### 5.5 `ai mcp`

Manage MCP skills — downloadable tool extensions for Claude.

**Built-in skills** (always installed, enable to activate):

| Skill | Tools |
|---|---|
| `shell` | `run_command` |
| `files` | `read_file`, `write_file`, `list_directory` |
| `http` | `fetch_url` |
| `calculator` | `evaluate` |

**Subcommands:**

| Subcommand | Description |
|---|---|
| `list` / `ls` | List all installed skills |
| `enable <name>` | Enable a skill (makes its tools available to Claude) |
| `disable <name>` | Disable a skill without removing it |
| `install <pkg\|path>` | Install from npm (`modern-ai-cli-skill-*`) or local `.mjs` file |
| `remove <name>` | Remove a non-built-in skill |
| `search [query]` | Search the remote skill registry |
| `run <tool> [--input json]` | Directly invoke a skill tool (debug/scripting) |

**Tool-use loop:** When skills are enabled, `sendMessage` / `sendMessageStream` inject tool definitions into the API call and execute up to 10 rounds of tool calls before returning.

---

### 5.6 `ai plugin`

Manage Commander.js plugin extensions.

Plugins are npm packages that export a `register(program)` function, loaded dynamically at startup.

**Subcommands:** `list`, `install`, `remove`

---

### 5.7 `ai agent`

Multi-agent coordination — specialized AI agents working together.

#### 5.7.1 Built-in Roles

| Role | Responsibility |
|---|---|
| `researcher` | Analyse requirements, gather context, identify constraints |
| `planner` | Break task into ordered, actionable steps |
| `coder` | Write, refactor, or debug code |
| `reviewer` | Check for bugs, security issues, code quality |
| `synthesizer` | Combine all outputs into a polished final response |

#### 5.7.2 `ai agent run [task]`

Auto-plan and execute a complex task. The orchestrator calls Claude to decompose the goal into an `AgentPlan` (list of `AgentTask` with role, prompt, and optional `dependsOn`), then executes tasks either in parallel or sequentially based on the plan's `executionMode`.

Live progress is displayed via `AgentBoard`.

#### 5.7.3 `ai agent solo <role> [task]`

Run a single built-in or custom agent without orchestration. Streams output directly.

#### 5.7.4 Custom Agent Management

| Subcommand | Description |
|---|---|
| `create [name]` | Define a custom agent with name, description, icon, tags, system prompt |
| `edit <name>` | Update an existing custom agent |
| `show <name>` | Print full metadata and system prompt |
| `remove <name>` | Delete a custom agent |
| `export <name>` | Print as portable JSON |
| `import <file>` | Import from JSON file |
| `roles` | List all built-in + custom agents |

Custom agents are persisted in the `conf` store and are also available to the auto-planner.

#### 5.7.5 Workflow Management (`ai agent workflow`)

Workflows are reusable JSON-defined pipelines of agent steps.

| Subcommand | Description |
|---|---|
| `list` | List saved workflows |
| `run <name\|file> [goal]` | Execute a workflow |
| `save <file>` | Register a workflow from a JSON file |
| `remove <name>` | Delete a saved workflow |
| `template [name]` | List or scaffold built-in templates |

**Workflow schema:** `{ name, description, executionMode: "parallel"\|"sequential", steps: [{ role, promptTemplate }] }`

#### 5.7.6 Organization Management (`ai agent org`)

Model a team of agents as companies and departments.

| Subcommand | Description |
|---|---|
| `show [company] [--desc]` | Display org chart |
| `run <company> [goal] [--dept]` | Run all agents in a company/department |
| `list` | List all companies |

#### 5.7.7 Memory (`ai agent memory`)

Per-agent and shared persistent memory store.

**Memory types:** `episodic`, `semantic`, `procedural`, `working`

| Subcommand | Description |
|---|---|
| `list [agent] [--type] [--min-importance] [--limit]` | List memories |
| `add <agent> <content> [--type] [--importance] [--tags] [--summary]` | Add memory entry |
| `search <query> [agent] [--limit]` | Keyword search |
| `distill [agent]` | AI-compress old memories |
| `clear [agent] [--shared]` | Delete memories |
| `shared [--query] [--limit]` | View the shared memory pool |
| `add-shared <content>` | Add to shared pool |
| `stats` | Memory statistics across all agents |

**Importance:** 0–10 integer score.

#### 5.7.8 Meetings (`ai agent meet`)

Structured multi-agent dialogue.

**Meeting modes:**

| Mode | Behaviour |
|---|---|
| `roundtable` | Each participant speaks in turn (default) |
| `debate` | Participants argue opposing positions |
| `brainstorm` | Generative, unconstrained idea generation |
| `review` | Critical examination of a proposal |

**Subcommands:**

| Subcommand | Description |
|---|---|
| `start [topic] [--participants] [--mode] [--rounds] [--no-memory] [--no-save-memory]` | Start a new meeting |
| `list [--limit]` | List past meetings |
| `show <id> [--summary]` | Show full transcript or summary |
| `remove <id>` | Delete a transcript |
| `modes` | List available meeting modes |

Default participants: `researcher`, `planner`, `synthesizer`. Meeting insights are optionally saved to the shared memory pool.

---

### 5.8 `ai whatsnew`

Display recent release notes / changelog.

---

## 6. AI Modes

Modes select a pre-configured system prompt injected at the start of each request.

| Mode | Description |
|---|---|
| `default` | General-purpose assistant |
| `code` | Expert software engineer & code assistant |
| `explain` | Patient teacher for complex topics |
| `refactor` | Senior code reviewer & refactoring expert |
| `debug` | Expert debugger & problem solver |
| `creative` | Creative writing assistant |
| `shell` | Shell scripting & CLI expert |

---

## 7. AI Client

**File:** `src/ai/client.ts`

### Public API

```typescript
sendMessage(messages: MessageParam[], systemOverride?: string): Promise<AIResponse>
sendMessageStream(messages: MessageParam[], onDelta: StreamCallback, systemOverride?: string): Promise<AIResponse>
resetClient(): void
```

```typescript
interface AIResponse {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  stopReason: string | null;
}
```

### Tool-Use Loop

Both functions call `getActiveTools()` from the MCP manager. If tools are present:
1. API call is made with tool definitions.
2. Any `tool_use` blocks in the response are dispatched to the matching MCP skill.
3. Tool results are appended and the API is called again.
4. Loop continues up to **10 rounds** or until `stop_reason === "end_turn"`.

---

## 8. Multi-Agent Orchestration

**File:** `src/agents/orchestrator.ts`

### Execution Flow

1. `orchestrate(goal, eventHandler)` calls Claude with a structured prompt requesting a JSON `AgentPlan`.
2. Plan is validated and emitted as a `plan_ready` event.
3. Tasks are executed:
   - **Sequential:** tasks run in order.
   - **Parallel:** independent tasks (no `dependsOn` overlap) run concurrently.
4. Each task calls `runSingleAgent(role, prompt, onDelta)` which calls `sendMessageStream` with the role's system prompt and any prior results injected as context.
5. Results accumulate; a final `synthesizer` pass optionally combines all outputs.
6. A `done` event with `OrchestrationResult` is emitted.

### Event Stream

```typescript
type AgentEvent =
  | { type: "plan_ready";  plan: AgentPlan }
  | { type: "task_start";  taskId: string; role: AgentRoleName }
  | { type: "task_delta";  taskId: string; role: AgentRoleName; delta: string }
  | { type: "task_done";   result: AgentResult }
  | { type: "final_start" }
  | { type: "final_delta"; delta: string }
  | { type: "done";        result: OrchestrationResult }
```

---

## 9. MCP Skill System

**Files:** `src/mcp/`

A skill is a named collection of tools defined by a `SkillManifest`:

```typescript
interface SkillManifest {
  name: string;
  version: string;
  description: string;
  source: "builtin" | "npm" | "local";
  enabled: boolean;
  tools: string[];           // tool names
  toolDefinitions: ToolDefinition[];
  handler?: string;          // path to .mjs handler module
}
```

Each `ToolDefinition` follows the Anthropic tool schema (`name`, `description`, `input_schema`).

**Dispatch:** `dispatchToolCall(toolName, input)` locates the owning skill and calls its handler. Returns `{ content: string, isError: boolean }`.

---

## 10. Plugin System

**File:** `src/plugins/loader.ts`

At startup, `loadPlugins(program)` discovers and loads npm packages whose name matches `modern-ai-cli-plugin-*`. Each plugin module must export:

```typescript
export function register(program: Command): void
```

---

## 11. Chat History

**File:** `src/utils/history.ts`

Sessions are persisted as `ChatSession` objects:

```typescript
interface ChatSession {
  id: string;
  title: string;
  messages: MessageParam[];
  createdAt: string;   // ISO 8601
  updatedAt: string;
}
```

Functions: `createSession()`, `saveSession(session)`, `loadSession(id)`, `listSessions()`

---

## 12. UI Components

| Component | Description |
|---|---|
| `theme` | `chalk`-based colour palette: `primary`, `secondary`, `success`, `warning`, `error`, `muted`, `dim`, `bold`, `assistant`, `user`, `heading` |
| `icons` | Unicode/emoji icon set: `sparkle`, `ai`, `user`, `success`, `error`, `warning`, `bullet` |
| `thinkingSpinner()` | `ora` spinner with "Thinking…" text |
| `createSpinner(text)` | Generic labelled spinner |
| `withSpinner(text, fn)` | Run async `fn` with a spinner; returns result |
| `printMessage(role, content)` | Formatted chat bubble with markdown rendering |
| `printUsage(in, out)` | Token usage footer |
| `divider()` | Horizontal rule |
| `renderMarkdown(text)` | `marked` + `marked-terminal` rendering |
| `AgentBoard` | Real-time multi-panel agent status display (TTY) |
| `MeetingBoard` | Real-time meeting turn display |

---

## 13. Build & Distribution

### Build

```
npm run build       # tsup → dist/ (ESM)
npm run postbuild   # embed git hash + dirty flag into dist/version.js
```

### Binary Packaging

Uses `@yao-pkg/pkg` to bundle Node 20 self-contained executables:

| Target | Output |
|---|---|
| `node20-linux-x64` | `release-assets/modern-ai-cli-linux-x64` |
| `node20-linux-arm64` | `release-assets/modern-ai-cli-linux-arm64` |
| `node20-macos-x64` | `release-assets/modern-ai-cli-macos-x64` |
| `node20-macos-arm64` | `release-assets/modern-ai-cli-macos-arm64` |
| `node20-win-x64` | `release-assets/modern-ai-cli-win-x64.exe` |

### Release

`semantic-release` with `conventionalcommits` preset. Publishes to npm (`access: public`) and creates GitHub releases with binary assets.

---

## 14. Testing

**Framework:** Jest 29 + `ts-jest` (ESM mode via `--experimental-vm-modules`)

```
npm test              # run all tests
npm run test:coverage # with coverage report
```

Test files are in `src/__tests__/`:

- `cli.test.ts` — CLI command registration
- `agents.test.ts` — multi-agent orchestration
- `prompts.test.ts` — system prompt logic
- `output.test.ts` — UI output helpers
- `theme.test.ts` — theme/colour functions
- `history.test.ts` — session persistence
- `mcp.test.ts` — MCP skill management
- `plugin-loader.test.ts` — plugin loading
- `upgrade-notifier.test.ts` — update check
- `whatsnew.test.ts` — changelog display

---

## 15. Environment Variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | API key fallback when `config.apiKey` is not set |

---

## 16. Error Handling

- All commands catch errors and print them via `theme.error()` before calling `process.exit(1)`.
- Unknown commands display a suggestion: `Run: ai --help`.
- Missing arguments show a formatted error message.
- The Anthropic client throws a descriptive error if `apiKey` is not configured.
