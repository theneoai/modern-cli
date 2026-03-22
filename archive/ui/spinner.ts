import ora, { type Ora } from "ora";
import { theme, icons } from "../theme/index.js";

/**
 * Creates a styled spinner for AI operations.
 */
export function createSpinner(text: string): Ora {
  return ora({
    text: theme.muted(text),
    spinner: {
      interval: 80,
      frames: [
        `${theme.primary("◐")} `,
        `${theme.primary("◓")} `,
        `${theme.primary("◑")} `,
        `${theme.primary("◒")} `,
      ],
    },
    color: "magenta",
  });
}

/**
 * Run an async operation with a spinner.
 * Returns the result and stops the spinner on completion or error.
 */
export async function withSpinner<T>(
  text: string,
  operation: () => Promise<T>,
  successText?: string
): Promise<T> {
  const spinner = createSpinner(text);
  spinner.start();

  try {
    const result = await operation();
    spinner.succeed(successText ?? theme.muted(text + " done"));
    return result;
  } catch (error) {
    spinner.fail(theme.muted(text + " failed"));
    throw error;
  }
}

/**
 * Thinking indicator for AI responses.
 */
export function thinkingSpinner(): Ora {
  return ora({
    text: theme.muted(`${icons.thinking} Claude is thinking...`),
    spinner: {
      interval: 120,
      frames: [
        `${theme.primary("✦")} `,
        `${theme.secondary("✦")} `,
        `${theme.primary("✧")} `,
        `${theme.secondary("✧")} `,
      ],
    },
  });
}

/**
 * Progress spinner with percentage
 */
export function progressSpinner(text: string, total: number): {
  update: (current: number) => void;
  succeed: (text?: string) => void;
  fail: (text?: string) => void;
} {
  let current = 0;
  const spinner = createSpinner(`${text} (0/${total})`);
  spinner.start();

  return {
    update: (value: number) => {
      current = value;
      const percent = Math.round((current / total) * 100);
      spinner.text = theme.muted(`${text} (${current}/${total}) ${percent}%`);
    },
    succeed: (text?: string) => spinner.succeed(text),
    fail: (text?: string) => spinner.fail(text),
  };
}
