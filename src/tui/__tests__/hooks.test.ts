import { describe, it, expect } from 'vitest';

describe('TUI Hooks', () => {
  describe('useScrollable', () => {
    it('should be importable', async () => {
      const { useScrollable } = await import('../hooks/useScrollable.js');
      expect(typeof useScrollable).toBe('function');
    });

    it('should export correct types', async () => {
      const mod = await import('../hooks/useScrollable.js');
      expect(mod).toHaveProperty('useScrollable');
      expect(mod).toHaveProperty('useScrollableKeyboard');
      expect(mod).toHaveProperty('useSelectable');
    });
  });

  describe('useKeyboard', () => {
    it('should be importable', async () => {
      const { useKeyboard } = await import('../hooks/useKeyboard.js');
      expect(typeof useKeyboard).toBe('function');
    });

    it('should export commonShortcuts', async () => {
      const { commonShortcuts } = await import('../hooks/useKeyboard.js');
      expect(typeof commonShortcuts).toBe('object');
      expect(commonShortcuts).toHaveProperty('exit');
      expect(commonShortcuts).toHaveProperty('commandPalette');
      expect(commonShortcuts).toHaveProperty('help');
    });
  });
});
