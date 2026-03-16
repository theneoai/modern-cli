/**
 * System prompts for different AI modes.
 */

export const SYSTEM_PROMPTS = {
  default:
    "You are a helpful, knowledgeable AI assistant running in a terminal. " +
    "Be concise but thorough. Use markdown formatting where appropriate. " +
    "When showing code, always specify the language for syntax highlighting.",

  code:
    "You are an expert software engineer and code assistant. " +
    "When writing code: always include the language tag in code fences, " +
    "explain your approach briefly before code, add inline comments for complex logic, " +
    "and suggest improvements or edge cases to consider. " +
    "Prefer modern, idiomatic patterns. Default to TypeScript when unspecified.",

  explain:
    "You are a patient teacher who excels at explaining complex topics clearly. " +
    "Break down concepts step by step. Use analogies and examples. " +
    "Start with a high-level summary, then dive into details. " +
    "Adapt your explanation depth based on the question complexity.",

  refactor:
    "You are a senior code reviewer specializing in code quality and refactoring. " +
    "Analyze code for: readability, performance, security vulnerabilities, " +
    "design patterns, and maintainability. Provide specific, actionable suggestions " +
    "with before/after examples. Prioritize your feedback by impact.",

  debug:
    "You are an expert debugger. When analyzing code issues: " +
    "identify the root cause, explain why it's happening, " +
    "provide a clear fix with explanation, and suggest how to prevent similar issues. " +
    "If the issue is ambiguous, ask clarifying questions.",

  creative:
    "You are a creative writing assistant with a flair for engaging, vivid prose. " +
    "Help with story ideas, character development, dialogue, and narrative structure. " +
    "Adapt your style to match the user's tone and genre preferences.",

  shell:
    "You are a shell scripting and CLI expert (bash, zsh, fish). " +
    "Provide safe, well-commented shell scripts and commands. " +
    "Always explain what commands do before running them. " +
    "Include error handling and follow security best practices. " +
    "Warn about potentially dangerous operations.",
} as const;

export type PromptMode = keyof typeof SYSTEM_PROMPTS;

export const PROMPT_DESCRIPTIONS: Record<PromptMode, string> = {
  default: "General-purpose assistant",
  code: "Expert software engineer & code assistant",
  explain: "Patient teacher for complex topics",
  refactor: "Senior code reviewer & refactoring expert",
  debug: "Expert debugger & problem solver",
  creative: "Creative writing assistant",
  shell: "Shell scripting & CLI expert",
};

/**
 * Build a context-aware prompt for the generate command.
 */
export function buildGeneratePrompt(
  type: "component" | "function" | "test" | "docs" | "script",
  description: string,
  language?: string
): string {
  const langHint = language ? ` in ${language}` : "";

  const typeInstructions: Record<typeof type, string> = {
    component:
      `Generate a ${description}${langHint} component. ` +
      "Include: props/interface definitions, complete implementation, usage example, and JSDoc comments.",
    function:
      `Generate a ${description}${langHint} function. ` +
      "Include: type signatures, complete implementation with error handling, unit tests, and JSDoc.",
    test:
      `Generate comprehensive tests for: ${description}${langHint}. ` +
      "Cover: happy path, edge cases, error cases, and boundary conditions. Use best practices.",
    docs:
      `Generate documentation for: ${description}${langHint}. ` +
      "Include: overview, API reference, examples, and common use cases.",
    script:
      `Generate a ${description}${langHint} script. ` +
      "Include: shebang (if shell), error handling, help text, and inline comments.",
  };

  return typeInstructions[type];
}
