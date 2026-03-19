# TUI 架构文档

## 概述

本文档介绍 HyperTerminal 的 TUI（Terminal User Interface）重构架构。新架构解决了原有代码中的窗口混乱、焦点冲突等问题，提供了更清晰、可维护的代码结构。

## 架构层次

```
┌─────────────────────────────────────────────────────────────┐
│                      Application Layer                       │
│                    App.new.tsx / Workbench                   │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      Context Layer                           │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌───────────┐ │
│  │TUIProvider │ │FocusProvider│ │ViewProvider│ │ToastProvider│
│  │ModalProvider│
│  └────────────┘ └────────────┘ └────────────┘ └───────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      Component Layer                         │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌───────────┐ │
│  │  Layout    │ │   Modal    │ │   Panel    │ │   Input   │ │
│  │ Components │ │Components  │ │Components  │ │Components │ │
│  └────────────┘ └────────────┘ └────────────┘ └───────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      Hook Layer                              │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌───────────┐ │
│  │ useFocus   │ │ useModal   │ │ useKeyboard│ │useScrollable│
│  │ useLayout  │ │ useToast   │ │ useSelectable│ │useViewport│
│  └────────────┘ └────────────┘ └────────────┘ └───────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Context Provider

### TUIProvider
管理终端尺寸、响应式布局、面板可见性。

```typescript
const { layout, toggleSidebar, toggleBottomPanel } = useTUI();
```

**功能：**
- 终端尺寸监听和断点计算
- 布局尺寸自动计算
- 面板显示/隐藏控制
- 紧凑模式检测

### FocusProvider
统一管理焦点状态和键盘输入分发。

```typescript
const { registerZone, setFocus, isActive } = useFocus();
```

**功能：**
- 焦点区域注册/注销
- 层级管理（BACKGROUND → TOAST）
- 自动焦点分配
- 键盘事件分发

### ToastProvider
管理通知队列和自动消失。

```typescript
const { showSuccess, showError, showInfo, showWarning } = useToast();
```

**功能：**
- 通知队列管理
- 自动消失定时器
- 多种通知类型
- 最大数量限制

### ModalProvider
管理弹窗层级和遮罩。

```typescript
const { openConfirm, openPalette, openInput } = useModal();
```

**功能：**
- 弹窗队列管理
- 层级控制
- 多种弹窗类型
- 遮罩显示

### ViewProvider
管理视图路由和历史记录。

```typescript
const { navigateTo, goBack, currentView } = useView();
```

**功能：**
- 视图切换
- 历史记录
- 视图数据传递

## Hooks

### useScrollable
滚动状态管理。

```typescript
const scroll = useScrollable({
  totalItems: 100,
  visibleItems: 10,
  onScroll: (state) => console.log(state.offset),
});

// scroll.scrollUp()
// scroll.scrollDown()
// scroll.scrollToTop()
// scroll.scrollToBottom()
```

### useSelectable
列表选择管理。

```typescript
const { state, actions } = useSelectable({
  totalItems: 10,
  visibleItems: 5,
  onSelect: (index) => console.log(index),
});

// actions.moveUp()
// actions.moveDown()
// actions.moveTo(index)
// actions.confirm()
```

### useKeyboard
键盘快捷键管理。

```typescript
useKeyboard({
  bindings: [
    { key: 'ctrl+s', handler: () => save() },
    { key: 'f1', handler: () => showHelp() },
  ],
});
```

### useFocusZone
注册焦点区域。

```typescript
const { isActive } = useFocusZone({
  id: 'my-panel',
  layer: FocusLayer.CONTENT,
  onKey: (input, key) => {
    if (key.upArrow) {
      moveUp();
      return true; // 已处理
    }
    return false; // 继续传播
  },
});
```

## 组件

### Focusable
可聚焦容器，提供视觉反馈。

```tsx
<Focusable
  id="my-panel"
  layer={FocusLayer.CONTENT}
  showIndicator
  indicatorStyle="border" // 'border' | 'background' | 'arrow'
  onKey={handleKey}
>
  <Content />
</Focusable>
```

### Scrollable
可滚动容器，提供滚动指示。

```tsx
<Scrollable
  totalItems={items.length}
  visibleItems={10}
  height={20}
  showIndicators
>
  {items.map(item => <Item key={item.id} {...item} />)}
</Scrollable>
```

### Selectable
可选择列表，提供键盘导航。

```tsx
<Selectable
  items={items}
  height={15}
  renderItem={(item, index, isSelected) => (
    <SelectableItem isSelected={isSelected}>
      <Text>{item.name}</Text>
    </SelectableItem>
  )}
  onSelect={(item, index) => setSelected(index)}
  onConfirm={(item, index) => openItem(item)}
/>
```

## 面板组件

### MainPanel
主消息面板，显示聊天消息。

```tsx
<MainPanel
  messages={messages}
  height={30}
  width={80}
  focusId="main-panel"
/>
```

### TaskPanel
任务面板，管理任务列表。

```tsx
<TaskPanel
  tasks={tasks}
  onUpdateTask={handleUpdate}
  onCompleteTask={handleComplete}
  onDeleteTask={handleDelete}
  height={15}
  focusId="task-panel"
/>
```

### Sidebar
侧边栏，显示日历、邮件、会议。

```tsx
<Sidebar
  events={events}
  emails={emails}
  meetings={meetings}
  height={30}
  width={30}
  focusId="sidebar"
/>
```

### InputBar
输入栏，处理用户输入。

```tsx
<InputBar
  onSubmit={handleSubmit}
  placeholder="Type a message..."
  mode="chat" // 'chat' | 'command'
/>
```

## 弹窗组件

### 使用 ModalProvider

```typescript
const { openConfirm, openPalette, openInput } = useModal();

// 确认对话框
openConfirm({
  title: 'Delete?',
  message: 'This cannot be undone',
  type: 'danger',
  onConfirm: () => deleteItem(),
});

// 命令面板
openPalette({
  items: [
    { id: '1', label: 'New Task', icon: '✓' },
    { id: '2', label: 'Settings', icon: '⚙' },
  ],
  onSelect: (item) => execute(item),
});

// 输入对话框
openInput({
  title: 'Rename',
  defaultValue: currentName,
  onSubmit: (value) => rename(value),
});
```

## 最佳实践

### 1. 焦点管理
- 每个可交互面板都应该有唯一的 focusId
- 使用适当的 FocusLayer
- 在 onKey 中返回 true 表示已处理事件

### 2. 键盘导航
- 使用 useScrollable 管理滚动
- 使用 useSelectable 管理列表选择
- 使用 useKeyboard 注册全局快捷键

### 3. 状态管理
- 使用 Context 管理全局状态
- 使用 useState 管理局部状态
- 使用 useCallback 优化性能

### 4. 性能优化
- 使用 React.memo 避免不必要的重渲染
- 使用 useMemo 缓存计算结果
- 虚拟列表处理大量数据

## 迁移指南

### 从旧组件迁移

**旧代码：**
```tsx
const [scrollOffset, setScrollOffset] = useState(0);
useInput((_, key) => {
  if (key.upArrow) setScrollOffset(p => p - 1);
});
```

**新代码：**
```tsx
const scroll = useScrollable({ totalItems: 100, visibleItems: 10 });
// 使用 scroll.scrollUp(), scroll.offset 等
```

**旧代码：**
```tsx
const [toasts, setToasts] = useState([]);
const showToast = (msg) => {
  setToasts([...toasts, msg]);
  setTimeout(() => setToasts(t => t.filter(x => x !== msg)), 3000);
};
```

**新代码：**
```tsx
const { showSuccess } = useToast();
showSuccess('Task completed!');
```

## 文件结构

```
src/tui/
├── contexts/           # Context Providers
│   ├── TUIProvider.tsx
│   ├── FocusContext.tsx
│   ├── ToastContext.tsx
│   ├── ModalContext.tsx
│   └── ViewContext.tsx
├── hooks/              # Custom Hooks
│   ├── useKeyboard.ts
│   ├── useScrollable.ts
│   └── index.ts
├── components/
│   ├── ui/             # 基础 UI 组件
│   │   ├── Focusable.tsx
│   │   ├── Scrollable.tsx
│   │   └── Selectable.tsx
│   ├── panel/          # 面板组件
│   │   ├── MainPanel.tsx
│   │   ├── TaskPanel.tsx
│   │   └── Sidebar.tsx
│   ├── input/          # 输入组件
│   │   └── InputBar.tsx
│   ├── modal/          # 弹窗组件
│   │   ├── ModalContainer.tsx
│   │   ├── ConfirmDialogContent.tsx
│   │   └── CommandPaletteContent.tsx
│   └── toast/          # 通知组件
│       └── Toast.tsx
├── App.new.tsx         # 重构后的主应用
└── index.ts            # 统一导出
```

## 测试

运行 TUI 测试：

```bash
npm test -- src/tui/__tests__
```

测试文件：
- `contexts.test.ts` - Context 枚举测试
- `hooks.test.ts` - Hooks 导出测试

## 示例

完整的示例应用：`App.new.tsx`

```bash
# 运行重构后的 TUI
npm run workbench
```

## 未来计划

1. 虚拟列表优化大数据渲染
2. 主题系统支持自定义配色
3. 动画效果提升用户体验
4. 插件系统支持第三方扩展
