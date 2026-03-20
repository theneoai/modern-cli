#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import App from './App.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';

// Suppress React dev warnings
process.env.NODE_ENV = 'production';

export function startTUI() {
  const app = render(
    <ErrorBoundary onReset={() => {
      // Clear any problematic state and restart
      console.clear();
    }}>
      <App />
    </ErrorBoundary>
  );
  
  // Handle cleanup on exit
  const cleanup = () => {
    app.unmount();
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
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startTUI();
}
