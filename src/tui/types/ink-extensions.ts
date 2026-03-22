import type { Key } from 'ink';

// Extended Key type with additional keys that Ink supports at runtime
// but doesn't include in its TypeScript type definitions
export type ExtendedKey = Key & {
  home?: boolean;
  end?: boolean;
};
