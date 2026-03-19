import { describe, it, expect } from 'vitest';

describe('TUI Utils', () => {
  describe('layout utils', () => {
    it('should export all layout functions', async () => {
      const mod = await import('../utils/layout.js');
      
      expect(typeof mod.calculateCenterPosition).toBe('function');
      expect(typeof mod.calculateModalPosition).toBe('function');
      expect(typeof mod.calculateVisibleItems).toBe('function');
      expect(typeof mod.calculateScrollOffset).toBe('function');
      expect(typeof mod.calculateVisibleRange).toBe('function');
      expect(typeof mod.shouldShowScrollIndicators).toBe('function');
      expect(typeof mod.calculateProgress).toBe('function');
      expect(typeof mod.formatFileSize).toBe('function');
      expect(typeof mod.formatDuration).toBe('function');
      expect(typeof mod.truncateText).toBe('function');
      expect(typeof mod.calculateLineCount).toBe('function');
      expect(typeof mod.calculateColumnWidths).toBe('function');
      expect(typeof mod.createResponsiveLayout).toBe('function');
    });

    it('should calculate center position correctly', async () => {
      const { calculateCenterPosition } = await import('../utils/layout.js');
      
      const pos = calculateCenterPosition(100, 50, 40, 20);
      expect(pos.x).toBe(30);
      expect(pos.y).toBe(15);
    });

    it('should calculate modal position for center', async () => {
      const { calculateModalPosition } = await import('../utils/layout.js');
      
      const pos = calculateModalPosition(100, 50, 40, 20, 'center');
      expect(pos.marginLeft).toBe(30);
      expect(pos.marginTop).toBe(15);
    });

    it('should calculate modal position for top', async () => {
      const { calculateModalPosition } = await import('../utils/layout.js');
      
      const pos = calculateModalPosition(100, 50, 40, 20, 'top');
      expect(pos.marginLeft).toBe(30);
      expect(pos.marginTop).toBe(2);
    });

    it('should calculate visible items correctly', async () => {
      const { calculateVisibleItems } = await import('../utils/layout.js');
      
      const count = calculateVisibleItems(100, 10, 20, 10);
      expect(count).toBe(7);
    });

    it('should calculate scroll offset correctly', async () => {
      const { calculateScrollOffset } = await import('../utils/layout.js');
      
      const offset = calculateScrollOffset(5, 10, 100);
      expect(offset).toBe(0);
    });

    it('should calculate visible range correctly', async () => {
      const { calculateVisibleRange } = await import('../utils/layout.js');
      
      const range = calculateVisibleRange(10, 5, 100);
      expect(range.start).toBe(10);
      expect(range.end).toBe(15);
    });

    it('should show scroll indicators correctly', async () => {
      const { shouldShowScrollIndicators } = await import('../utils/layout.js');
      
      const indicators = shouldShowScrollIndicators(10, 5, 100);
      expect(indicators.showAbove).toBe(true);
      expect(indicators.showBelow).toBe(true);
    });

    it('should calculate progress correctly', async () => {
      const { calculateProgress } = await import('../utils/layout.js');
      
      expect(calculateProgress(50, 100)).toBe(50);
      expect(calculateProgress(0, 100)).toBe(0);
      expect(calculateProgress(100, 100)).toBe(100);
    });

    it('should format file size correctly', async () => {
      const { formatFileSize } = await import('../utils/layout.js');
      
      expect(formatFileSize(512)).toBe('512.0 B');
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    });

    it('should format duration correctly', async () => {
      const { formatDuration } = await import('../utils/layout.js');
      
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(5000)).toBe('5s');
      expect(formatDuration(120000)).toBe('2m 0s');
    });

    it('should truncate text correctly', async () => {
      const { truncateText } = await import('../utils/layout.js');
      
      expect(truncateText('Hello World', 20)).toBe('Hello World');
      expect(truncateText('Hello World This Is Long', 10)).toBe('Hello W...');
    });

    it('should calculate column widths correctly', async () => {
      const { calculateColumnWidths } = await import('../utils/layout.js');
      
      const widths = calculateColumnWidths(100, [1, 2, 2]);
      expect(widths).toEqual([20, 40, 40]);
    });

    it('should create compact layout for small terminal', async () => {
      const { createResponsiveLayout } = await import('../utils/layout.js');
      
      const layout = createResponsiveLayout(60, 20);
      expect(layout.sidebarWidth).toBe(0);
      expect(layout.showRightPanel).toBe(false);
    });

    it('should create wide layout for large terminal', async () => {
      const { createResponsiveLayout } = await import('../utils/layout.js');
      
      const layout = createResponsiveLayout(140, 50);
      expect(layout.sidebarWidth).toBe(40);
      expect(layout.showRightPanel).toBe(true);
    });
  });
});
