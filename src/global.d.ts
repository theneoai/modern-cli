/**
 * global.d.ts — Ambient type augmentations
 *
 * Provides Node.js-specific globals that are not in ES2022 lib.
 * These are available at runtime in Node 18+ but need manual declarations
 * when @types/node is unavailable (e.g., in CI without node_modules).
 */

// import.meta.url is part of the ESM spec (Node 12+)
interface ImportMeta {
  url: string;
}
