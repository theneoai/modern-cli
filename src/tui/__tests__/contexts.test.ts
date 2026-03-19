import { describe, it, expect } from 'vitest';

describe('TUI Contexts', () => {
  describe('Exports', () => {
    it('should export FocusLayer enum with correct values', async () => {
      const { FocusLayer } = await import('../contexts/FocusContext.js');
      expect(FocusLayer.BACKGROUND).toBe(0);
      expect(FocusLayer.CONTENT).toBe(1);
      expect(FocusLayer.SIDEBAR).toBe(2);
      expect(FocusLayer.PANEL).toBe(3);
      expect(FocusLayer.MODAL).toBe(4);
      expect(FocusLayer.DIALOG).toBe(5);
      expect(FocusLayer.OVERLAY).toBe(6);
      expect(FocusLayer.TOAST).toBe(7);
    });

    it('should export ModalType enum with correct values', async () => {
      const { ModalType } = await import('../contexts/ModalContext.js');
      expect(ModalType.MODAL).toBe('modal');
      expect(ModalType.DIALOG).toBe('dialog');
      expect(ModalType.POPOVER).toBe('popover');
      expect(ModalType.PALETTE).toBe('palette');
      expect(ModalType.CONFIRM).toBe('confirm');
      expect(ModalType.INPUT).toBe('input');
    });

    it('should export Breakpoint enum with correct values', async () => {
      const { Breakpoint } = await import('../contexts/TUIProvider.js');
      expect(Breakpoint.COMPACT).toBe('compact');
      expect(Breakpoint.NORMAL).toBe('normal');
      expect(Breakpoint.WIDE).toBe('wide');
    });
  });
});
