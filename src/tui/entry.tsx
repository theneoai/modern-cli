#!/usr/bin/env node

import { render } from 'ink';
import FlowApp from './FlowApp.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';

// Suppress React dev warnings
process.env.NODE_ENV = 'production';

export function startTUI() {
  const app = render(
    <ErrorBoundary onReset={() => {
      console.clear();
    }}>
      <FlowApp />
    </ErrorBoundary>
  );

  // Guard against double-cleanup: SIGINT calls cleanup() then process.exit(0),
  // which fires the 'exit' event again — calling cleanup() a second time would
  // throw "React tree has been unmounted".
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try { app.unmount(); } catch (_) { /* already unmounted */ }
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });

  // Prevent uncaught async errors from crashing with a raw stack trace.
  // These can come from plugin timers, companion, or intel background tasks.
  process.on('uncaughtException', (err) => {
    cleanup();
    process.stderr.write(`\nError: ${err.message}\n`);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    cleanup();
    const msg = reason instanceof Error ? reason.message : String(reason);
    process.stderr.write(`\nUnhandled rejection: ${msg}\n`);
    process.exit(1);
  });
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startTUI();
}
