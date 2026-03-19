import { describe, it, expect } from 'vitest';

describe('TUI Components', () => {
  describe('UI Components', () => {
    it('should export all UI components', async () => {
      const mod = await import('../components/ui/index.js');
      
      expect(typeof mod.Focusable).toBe('function');
      expect(typeof mod.FocusIndicator).toBe('function');
      expect(typeof mod.FocusBorder).toBe('function');
      expect(typeof mod.Scrollable).toBe('function');
      expect(typeof mod.ScrollProgress).toBe('function');
      expect(typeof mod.ScrollableList).toBe('function');
      expect(typeof mod.Selectable).toBe('function');
      expect(typeof mod.SelectableItem).toBe('function');
    });
  });

  describe('Layout Components', () => {
    it('should export all layout components', async () => {
      const mod = await import('../components/layout/index.js');
      
      expect(typeof mod.Header).toBe('function');
      expect(typeof mod.CompactHeader).toBe('function');
      expect(typeof mod.StatusBar).toBe('function');
      expect(typeof mod.StatusItem).toBe('function');
      expect(typeof mod.Footer).toBe('function');
      expect(typeof mod.CompactFooter).toBe('function');
      expect(typeof mod.NavigationFooter).toBe('function');
    });
  });

  describe('Panel Components', () => {
    it('should export all panel components', async () => {
      const mod = await import('../components/panel/index.js');
      
      expect(typeof mod.MainPanel).toBe('function');
      expect(typeof mod.TaskPanel).toBe('function');
      expect(typeof mod.Sidebar).toBe('function');
    });
  });

  describe('Input Components', () => {
    it('should export all input components', async () => {
      const mod = await import('../components/input/index.js');
      
      expect(typeof mod.InputBar).toBe('function');
    });
  });

  describe('Toast Components', () => {
    it('should export all toast components', async () => {
      const mod = await import('../components/toast/index.js');
      
      expect(typeof mod.Toast).toBe('function');
      expect(typeof mod.ToastContainer).toBe('function');
      expect(typeof mod.SimpleToast).toBe('function');
    });
  });

  describe('Modal Components', () => {
    it('should export all modal components', async () => {
      const mod = await import('../components/modal/index.js');
      
      expect(typeof mod.ModalContainer).toBe('function');
      expect(typeof mod.ModalContent).toBe('function');
      expect(typeof mod.ModalActions).toBe('function');
      expect(typeof mod.ModalButton).toBe('function');
      expect(typeof mod.ConfirmDialogContent).toBe('function');
      expect(typeof mod.ConfirmDialog).toBe('function');
      expect(typeof mod.CommandPaletteContent).toBe('function');
      expect(typeof mod.InputDialogContent).toBe('function');
    });
  });

  describe('Legacy Components', () => {
    it('should export ErrorBoundary', async () => {
      const mod = await import('../components/ErrorBoundary.js');
      expect(typeof mod.ErrorBoundary).toBe('function');
    });

    it('should export FullScreen', async () => {
      const mod = await import('../components/FullScreen.js');
      expect(typeof mod.FullScreen).toBe('function');
    });
  });
});
