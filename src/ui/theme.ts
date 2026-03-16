import chalk from "chalk";

export const theme = {
  primary: chalk.hex("#7C3AED"),      // Purple - AI vibes
  secondary: chalk.hex("#06B6D4"),    // Cyan
  success: chalk.hex("#10B981"),      // Green
  warning: chalk.hex("#F59E0B"),      // Amber
  error: chalk.hex("#EF4444"),        // Red
  muted: chalk.hex("#6B7280"),        // Gray
  bold: chalk.bold,
  dim: chalk.dim,
  italic: chalk.italic,

  // Compound styles
  heading: chalk.bold.hex("#7C3AED"),
  code: chalk.bgHex("#1E1E2E").hex("#CDD6F4"),
  user: chalk.bold.hex("#60A5FA"),    // Blue - user messages
  assistant: chalk.bold.hex("#A78BFA"), // Light purple - AI messages
  info: chalk.hex("#64748B"),
};

export const icons = {
  ai: "✦",
  user: "▸",
  success: "✔",
  error: "✖",
  warning: "⚠",
  arrow: "→",
  bullet: "•",
  thinking: "◌",
  sparkle: "✦",
  robot: "⬡",
};

export function formatHeader(title: string): string {
  const line = "─".repeat(Math.min(50, title.length + 4));
  return `\n${theme.primary(line)}\n${theme.heading(`  ${title}  `)}\n${theme.primary(line)}\n`;
}

export function formatSection(label: string, content: string): string {
  return `${theme.muted(label + ":")} ${content}`;
}

export function formatError(message: string): string {
  return `${theme.error(icons.error)} ${theme.error(message)}`;
}

export function formatSuccess(message: string): string {
  return `${theme.success(icons.success)} ${message}`;
}

export function formatWarning(message: string): string {
  return `${theme.warning(icons.warning)} ${theme.warning(message)}`;
}
