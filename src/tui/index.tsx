#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import App from './App.js';

// Suppress React dev warnings
process.env.NODE_ENV = 'production';

export function startTUI() {
  const { clear } = render(<App />);
  
  // Handle cleanup
  process.on('exit', () => {
    clear();
  });
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startTUI();
}
