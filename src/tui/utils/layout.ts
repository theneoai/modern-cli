/**
 * Layout Utilities - 布局工具函数
 */



/**
 * 计算居中位置
 */
export function calculateCenterPosition(
  containerWidth: number,
  containerHeight: number,
  elementWidth: number,
  elementHeight: number
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.floor((containerWidth - elementWidth) / 2)),
    y: Math.max(0, Math.floor((containerHeight - elementHeight) / 2)),
  };
}

/**
 * 计算弹窗最佳位置
 */
export function calculateModalPosition(
  terminalWidth: number,
  terminalHeight: number,
  modalWidth: number,
  modalHeight: number,
  preferredPosition: 'center' | 'top' | 'bottom' = 'center'
): { marginLeft: number; marginTop: number } {
  const centerX = Math.max(0, Math.floor((terminalWidth - modalWidth) / 2));
  
  let centerY: number;
  switch (preferredPosition) {
    case 'top':
      centerY = 2;
      break;
    case 'bottom':
      centerY = Math.max(0, terminalHeight - modalHeight - 2);
      break;
    case 'center':
    default:
      centerY = Math.max(0, Math.floor((terminalHeight - modalHeight) / 2));
      break;
  }
  
  return {
    marginLeft: centerX,
    marginTop: centerY,
  };
}

/**
 * 计算可见项目数
 */
export function calculateVisibleItems(
  containerHeight: number,
  itemHeight: number,
  headerHeight: number = 0,
  footerHeight: number = 0
): number {
  const availableHeight = containerHeight - headerHeight - footerHeight;
  return Math.max(1, Math.floor(availableHeight / itemHeight));
}

/**
 * 计算滚动偏移量（保持项目在视图中）
 */
export function calculateScrollOffset(
  selectedIndex: number,
  visibleCount: number,
  totalCount: number
): number {
  const maxOffset = Math.max(0, totalCount - visibleCount);
  
  if (selectedIndex < 0) {
    return 0;
  }
  
  if (selectedIndex >= totalCount) {
    return maxOffset;
  }
  
  // If selected item is above current view
  if (selectedIndex < 0) {
    return selectedIndex;
  }
  
  // If selected item is below current view
  const currentEnd = 0 + visibleCount;
  if (selectedIndex >= currentEnd) {
    return Math.min(maxOffset, selectedIndex - visibleCount + 1);
  }
  
  return 0;
}

/**
 * 计算列表可视范围
 */
export function calculateVisibleRange(
  offset: number,
  visibleCount: number,
  totalCount: number
): { start: number; end: number } {
  const start = Math.min(offset, totalCount);
  const end = Math.min(start + visibleCount, totalCount);
  return { start, end };
}

/**
 * 检查是否需要显示滚动指示器
 */
export function shouldShowScrollIndicators(
  offset: number,
  visibleCount: number,
  totalCount: number
): { showAbove: boolean; showBelow: boolean } {
  return {
    showAbove: offset > 0,
    showBelow: offset + visibleCount < totalCount,
  };
}

/**
 * 计算进度百分比
 */
export function calculateProgress(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((current / total) * 100)));
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * 格式化持续时间
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * 截断文本并添加省略号
 */
export function truncateText(text: string, maxLength: number, ellipsis: string = '...'): string {
  if (text.length <= maxLength) {
    return text;
  }
  
  const availableLength = maxLength - ellipsis.length;
  if (availableLength <= 0) {
    return ellipsis.slice(0, maxLength);
  }
  
  return text.slice(0, availableLength) + ellipsis;
}

/**
 * 计算文本行数
 */
export function calculateLineCount(text: string, lineWidth: number): number {
  const lines = text.split('\n');
  let totalLines = 0;
  
  for (const line of lines) {
    totalLines += Math.max(1, Math.ceil(line.length / lineWidth));
  }
  
  return totalLines;
}

/**
 * 计算自适应列宽
 */
export function calculateColumnWidths(
  totalWidth: number,
  columnRatios: number[]
): number[] {
  const totalRatio = columnRatios.reduce((sum, r) => sum + r, 0);
  
  return columnRatios.map(ratio => {
    const width = Math.floor((ratio / totalRatio) * totalWidth);
    return Math.max(1, width);
  });
}

/**
 * 创建响应式布局配置
 */
export interface ResponsiveLayout {
  compact: LayoutConfig;
  normal: LayoutConfig;
  wide: LayoutConfig;
}

export interface LayoutConfig {
  sidebarWidth: number;
  bottomPanelHeight: number;
  showRightPanel: boolean;
  fontSize: 'small' | 'normal' | 'large';
}

export function createResponsiveLayout(
  terminalWidth: number,
  terminalHeight: number
): LayoutConfig {
  // Compact mode
  if (terminalWidth < 80 || terminalHeight < 24) {
    return {
      sidebarWidth: 0,
      bottomPanelHeight: 0,
      showRightPanel: false,
      fontSize: 'small',
    };
  }
  
  // Wide mode
  if (terminalWidth > 120) {
    return {
      sidebarWidth: 40,
      bottomPanelHeight: Math.min(15, Math.floor(terminalHeight * 0.3)),
      showRightPanel: true,
      fontSize: 'normal',
    };
  }
  
  // Normal mode
  return {
    sidebarWidth: 30,
    bottomPanelHeight: Math.min(12, Math.floor(terminalHeight * 0.25)),
    showRightPanel: false,
    fontSize: 'normal',
  };
}
