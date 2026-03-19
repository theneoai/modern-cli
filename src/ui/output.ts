/**
 * Output formatting utilities
 * Re-export from unified theme system
 */

import chalk from 'chalk';
import { 
  theme, 
  icons, 
  renderMarkdown as baseRenderMarkdown,
  formatHeader,
  formatSection,
  formatError,
  formatSuccess,
  formatWarning,
  wrapText,
  layout,
} from '../theme/index.js';

export {
  theme,
  icons,
  formatHeader,
  formatSection,
  formatError,
  formatSuccess,
  formatWarning,
  wrapText,
};

/**
 * Renders markdown-like content with terminal styling.
 * Handles code blocks, bold, italic, headers, and lists.
 */
export function renderMarkdown(text: string): string {
  // Use the base implementation from theme
  let result = baseRenderMarkdown?.(text) || text;
  
  // Additional enhancements specific to CLI output
  // Code blocks (```...```)
  result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    const lines = code.trimEnd().split("\n");
    const formatted = lines.map((l: string) => chalk.bgHex("#1E1E2E").hex("#CDD6F4")("  " + l + "  ")).join("\n");
    return "\n" + formatted + "\n";
  });

  // Inline code (`...`)
  result = result.replace(/`([^`]+)`/g, (_m, code) =>
    chalk.bgHex("#2d2d2d").hex("#e2e8f0")(" " + code + " ")
  );

  // Headers
  result = result.replace(/^### (.+)$/gm, (_m, h) => theme.heading("  " + h));
  result = result.replace(/^## (.+)$/gm, (_m, h) => "\n" + theme.heading("▌ " + h));
  result = result.replace(/^# (.+)$/gm, (_m, h) => "\n" + theme.heading("█ " + h) + "\n");

  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, (_m, t) => chalk.bold(t));

  // Italic
  result = result.replace(/\*(.+?)\*/g, (_m, t) => chalk.italic(t));

  // Bullet lists
  result = result.replace(/^[-*] (.+)$/gm, (_m, item) =>
    `  ${theme.secondary(icons.bullet)} ${item}`
  );

  // Numbered lists
  result = result.replace(/^(\d+)\. (.+)$/gm, (_m, n, item) =>
    `  ${theme.muted(n + ".")} ${item}`
  );

  // Horizontal rule
  result = result.replace(/^---$/gm, theme.muted("─".repeat(50)));

  return result;
}

/**
 * Prints a styled message label + content block.
 */
export function printMessage(
  role: "user" | "assistant" | "system",
  content: string
): void {
  const labels: Record<string, string> = {
    user: `${theme.user(icons.user + " You")}`,
    assistant: `${theme.assistant(icons.ai + " Claude")}`,
    system: `${theme.muted(icons.bullet + " System")}`,
  };

  const label = labels[role] || role;
  console.log(`\n${label}`);

  if (role === "assistant") {
    console.log(renderMarkdown(content));
  } else {
    console.log(theme.dim("  " + content.replace(/\n/g, "\n  ")));
  }
}

/**
 * Print a divider line.
 */
export function divider(): void {
  console.log(theme.muted("─".repeat(50)));
}

/**
 * Print token usage stats.
 */
export function printUsage(inputTokens: number, outputTokens: number): void {
  console.log(
    "\n" +
    theme.muted(
      `  ${icons.bullet} tokens: ${inputTokens} in · ${outputTokens} out · ~$${((inputTokens * 5 + outputTokens * 25) / 1_000_000).toFixed(4)}`
    )
  );
}

/**
 * Print a progress bar
 */
export function progressBar(current: number, total: number, width = 20): string {
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  return chalk.hex(layout.colors?.primary || '#6366f1')('█'.repeat(filled)) + 
         chalk.hex(layout.colors?.border || '#334155')('░'.repeat(empty));
}

/**
 * Print a table row
 */
export function tableRow(columns: string[], widths: number[]): string {
  return columns.map((col, i) => {
    const width = widths[i] || col.length;
    return col.slice(0, width).padEnd(width);
  }).join('  ');
}
