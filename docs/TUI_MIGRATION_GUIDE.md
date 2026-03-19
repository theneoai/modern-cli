# TUI 重构迁移指南

## 概述

本文档指导开发者如何从旧的 TUI 架构迁移到新的重构架构。

## 主要变化

### 1. 全局状态管理

**旧方式:**
```tsx
// App.tsx 中直接管理所有状态
const [messages, setMessages] = useState([]);
const [tasks, setTasks] = useState([]);
const [showCommandPalette, setShowCommandPalette] = useState(false);
```

**新方式:**
```tsx
// 使用 Context Provider
import { 
  TUIProvider, 
  FocusProvider, 
  ToastProvider, 
  ModalProvider,
  ViewProvider 
} from '../tui/index.js';

<TUIProvider>
  <FocusProvider>
    <ToastProvider>
      <ModalProvider>
        <ViewProvider>
          <App />
        </ViewProvider>
      </ModalProvider>
    </ToastProvider>
  </FocusProvider>
</TUIProvider>
```

### 2. 焦点管理

**旧方式:**
```tsx
const [activePanel, setActivePanel] = useState('main');

useInput((input, key) => {
  if (key.tab) {
    setActivePanel(prev => prev === 'main' ? 'sidebar' : 'main');
  }
});
```

**新方式:**
```tsx
import { useFocusZone, FocusLayer } from '../tui/index.js';

function MyComponent() {
  const { isActive } = useFocusZone({
    id: 'my-panel',
    layer: FocusLayer.CONTENT,
    onKey: (input, key) => {
      // 处理键盘事件
      return true; // 返回 true 表示已处理
    },
  });
  
  return (
    <Box borderColor={isActive ? theme.colors.primary : theme.colors.border}>
      {/* content */}
    </Box>
  );
}
```

### 3. Toast 通知

**旧方式:**
```tsx
const [toasts, setToasts] = useState([]);

const showToast = (type, content) => {
  const id = Date.now().toString();
  setToasts(prev => [...prev, { id, type, content }]);
  setTimeout(() => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, 3000);
};
```

**新方式:**
```tsx
import { useToast } from '../tui/index.js';

function MyComponent() {
  const { showSuccess, showError, showWarning, showInfo } = useToast();
  
  // 使用
  showSuccess('Task completed!');
  showError('Something went wrong');
  showInfo('Processing...');
}
```

### 4. Modal 弹窗

**旧方式:**
```tsx
const [showDialog, setShowDialog] = useState(false);

{showDialog && (
  <ConfirmDialog 
    onConfirm={() => setShowDialog(false)}
    onCancel={() => setShowDialog(false)}
  />
)}
```

**新方式:**
```tsx
import { useModal } from '../tui/index.js';

function MyComponent() {
  const { openConfirm, openPalette, openInput } = useModal();
  
  // 确认对话框
  const handleDelete = () => {
    openConfirm({
      title: 'Delete Item?',
      message: 'This action cannot be undone.',
      type: 'danger',
      onConfirm: () => {
        // 执行删除
      },
    });
  };
  
  // 命令面板
  const handleOpenPalette = () => {
    openPalette({
      items: [
        { id: '1', label: 'Command 1', icon: '⚡' },
        { id: '2', label: 'Command 2', icon: '📋' },
      ],
      onSelect: (item) => console.log(item.label),
    });
  };
}
```

### 5. 滚动管理

**旧方式:**
```tsx
const [scrollOffset, setScrollOffset] = useState(0);

useInput((input, key) => {
  if (key.upArrow) {
    setScrollOffset(prev => Math.max(0, prev - 1));
  }
  if (key.downArrow) {
    setScrollOffset(prev => prev + 1);
  }
});
```

**新方式:**
```tsx
import { useScrollable } from '../tui/index.js';

function MyComponent({ items }) {
  const scroll = useScrollable({
    totalItems: items.length,
    visibleItems: 10,
  });
  
  // scroll.offset - 当前滚动位置
  // scroll.scrollUp() - 向上滚动
  // scroll.scrollDown() - 向下滚动
  // scroll.scrollToTop() - 滚动到顶部
  // scroll.scrollToBottom() - 滚动到底部
  
  const visibleItems = items.slice(scroll.offset, scroll.offset + 10);
  
  return (
    <Box>
      {scroll.hasMoreAbove && <Text>▲ More above</Text>}
      {visibleItems.map(...)}
      {scroll.hasMoreBelow && <Text>▼ More below</Text>}
    </Box>
  );
}
```

### 6. 可选择列表

**新方式:**
```tsx
import { Selectable, SelectableItem } from '../tui/index.js';

function MyList({ items }) {
  return (
    <Selectable
      items={items}
      height={10}
      renderItem={(item, index, isSelected) => (
        <SelectableItem isSelected={isSelected}>
          <Text>{item.name}</Text>
        </SelectableItem>
      )}
      onSelect={(item, index) => console.log('Selected:', item)}
      onConfirm={(item, index) => console.log('Confirmed:', item)}
    />
  );
}
```

### 7. 键盘快捷键

**新方式:**
```tsx
import { useKeyboard, commonShortcuts } from '../tui/index.js';

function MyComponent() {
  useKeyboard({
    bindings: [
      {
        key: 'ctrl+p',
        handler: (input, key) => {
          console.log('Ctrl+P pressed');
          return true; // 阻止传播
        },
        description: 'Open palette',
      },
      {
        key: 'f1',
        handler: () => showHelp(),
        description: 'Show help',
      },
    ],
  });
}
```

## 视图路由

**新方式:**
```tsx
import { useView, useViewNavigation } from '../tui/index.js';

function MyComponent() {
  const { currentView, isView, isWorkbench } = useView();
  const { navigateTo, goBack, goHome } = useViewNavigation();
  
  // 切换视图
  navigateTo('tasks');
  navigateTo('chat', { someData: true }); // 带数据
  
  // 返回上一视图
  goBack();
  
  // 返回首页
  goHome();
  
  // 判断当前视图
  if (isView('tasks', 'calendar')) {
    // 当前是 tasks 或 calendar 视图
  }
}
```

## 布局响应式

**新方式:**
```tsx
import { useTUI, useLayout, Breakpoint } from '../tui/index.js';

function MyComponent() {
  const { layout, toggleSidebar } = useTUI();
  const { terminal, panels, isCompact } = useLayout();
  
  // 终端尺寸
  console.log(terminal.width, terminal.height);
  console.log(terminal.breakpoint); // 'compact' | 'normal' | 'wide'
  
  // 面板状态
  console.log(panels.sidebar); // true | false
  console.log(panels.bottomPanel);
  
  // 布局尺寸
  console.log(layout.layoutSizes.mainPanelWidth);
  console.log(layout.layoutSizes.sidebarWidth);
  
  // 紧凑模式
  if (isCompact) {
    return <CompactView />;
  }
  
  // 切换侧边栏
  toggleSidebar();
}
```

## 组件迁移清单

| 旧组件 | 新组件 | 状态 |
|--------|--------|------|
| App.tsx | App.new.tsx | ✅ 已完成 |
| Workbench.tsx | workbench/ 目录 | ⏳ 待迁移 |
| Header.tsx | AppHeader | ✅ 已整合 |
| MainPanel.tsx | MainPanel + Scrollable | ⏳ 待迁移 |
| Sidebar.tsx | Sidebar + Selectable | ⏳ 待迁移 |
| TaskPanel.tsx | 使用 Selectable | ⏳ 待迁移 |
| InputBar.tsx | InputBar + useKeyboard | ⏳ 待迁移 |
| CommandPalette.tsx | useModal + openPalette | ✅ 已完成 |
| ConfirmDialog.tsx | useModal + openConfirm | ✅ 已完成 |
| Toast.tsx | useToast | ✅ 已完成 |

## 迁移步骤

1. **安装新架构** - 新的 Provider 和 Hooks 已可用
2. **逐步替换** - 逐个组件迁移，保持旧组件可用
3. **测试验证** - 每迁移一个组件进行测试
4. **清理旧代码** - 全部迁移完成后删除旧文件

## 向后兼容

旧组件仍然可用，不会立即删除。建议在开发新功能时使用新架构，逐步迁移旧代码。
