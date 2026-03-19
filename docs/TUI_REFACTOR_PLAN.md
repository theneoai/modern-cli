# TUI 深度重构方案

## 当前问题分析

### 1. 架构问题
| 问题 | 影响 | 示例 |
|------|------|------|
| 状态管理混乱 | App.tsx 400+ 行，维护困难 | messages, tasks, panels, modals 全部堆在一起 |
| 输入处理冲突 | 多个 useInput 钩子互相干扰 | Sidebar 和 MainPanel 同时监听箭头键 |
| 布局计算分散 | 响应式处理不一致 | 各组件自己计算尺寸 |

### 2. 窗口管理问题
| 问题 | 影响 | 示例 |
|------|------|------|
| 无窗口管理系统 | 弹窗无法控制层级 | Toast 可能被其他组件遮挡 |
| 无焦点管理 | 用户迷失方向 | 不知道当前键盘输入会作用于哪个组件 |
| 重叠冲突 | 界面混乱 | CommandPalette 和 ExitConfirm 可能同时显示 |

### 3. 交互问题
| 问题 | 影响 | 示例 |
|------|------|------|
| 快捷键冲突 | 操作失效 | Tab 既用于切换面板又用于触发命令面板 |
| 缺少导航反馈 | 体验差 | 焦点变化没有视觉指示 |
| 工作台过于庞大 | 维护困难 | Workbench.tsx 703 行，所有组件混在一起 |

---

## 重构目标

1. **清晰的架构分层** - 状态、视图、交互分离
2. **统一的焦点系统** - 明确的焦点管理和视觉反馈
3. **窗口层级管理** - 弹窗、对话框、Toast 有序管理
4. **模块化组件** - 每个组件职责单一，可独立测试
5. **一致的用户体验** - 统一的快捷键、导航、反馈

---

## 新架构设计

### 1. 架构分层

```
┌─────────────────────────────────────────────────────────────┐
│                      Application Layer                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │   App.tsx    │ │ Workbench.tsx│ │    Other Views       │ │
│  │  (Simple)    │ │  (Clean)     │ │                      │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      Context Layer                           │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌───────────┐ │
│  │TUIProvider │ │FocusProvider│ │ViewProvider│ │ToastProvider│
│  │(全局状态)   │ │(焦点管理)   │ │(视图路由)   │ │(通知管理)   │
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
│  │ useFocus   │ │ useModal   │ │ useKeyboard│ │useTerminal│ │
│  │ useLayout  │ │ useToast   │ │ useViewport│ │useAnimation│
│  └────────────┘ └────────────┘ └────────────┘ └───────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2. 焦点管理系统

```typescript
// 焦点层级定义
enum FocusLayer {
  BACKGROUND = 0,   // 背景内容
  CONTENT = 1,      // 主内容区
  SIDEBAR = 2,      // 侧边栏
  PANEL = 3,        // 面板
  MODAL = 4,        // 模态框
  OVERLAY = 5,      // 覆盖层
  TOAST = 6,        // 通知 (最高)
}

// 焦点区域定义
interface FocusZone {
  id: string;
  layer: FocusLayer;
  priority: number;      // 同层优先级
  captureInput: boolean; // 是否独占输入
  onFocus?: () => void;
  onBlur?: () => void;
  onKey?: (key: Key) => boolean; // 返回 true 表示已处理
}
```

### 3. 窗口层级系统

```typescript
// 窗口类型
enum WindowType {
  TOAST = 'toast',           // 自动消失
  TOOLTIP = 'tooltip',       // 提示
  POPOVER = 'popover',       // 弹出菜单
  MODAL = 'modal',           // 模态对话框
  DIALOG = 'dialog',         // 非模态对话框
  FULLSCREEN = 'fullscreen', // 全屏覆盖
}

// 窗口管理
interface WindowManager {
  windows: Map<string, WindowState>;
  activeWindowId: string | null;
  
  open(type: WindowType, config: WindowConfig): string;
  close(id: string): void;
  focus(id: string): void;
  bringToFront(id: string): void;
}
```

### 4. 布局系统

```typescript
// 响应式断点
enum Breakpoint {
  COMPACT = 'compact',     // < 80 cols
  NORMAL = 'normal',       // 80-120 cols
  WIDE = 'wide',           // > 120 cols
}

// 布局配置
interface LayoutConfig {
  breakpoint: Breakpoint;
  sidebar: {
    visible: boolean;
    width: number;
    position: 'left' | 'right';
  };
  panels: {
    bottom: { visible: boolean; height: number };
    right: { visible: boolean; width: number };
  };
  input: {
    position: 'bottom' | 'top';
    height: number;
  };
}
```

---

## 目录结构重构

```
src/tui/
├── index.tsx                    # 入口（简化）
├── App.tsx                      # 主应用（简化）
├── Workbench.tsx                # 工作台（重构后）
│
├── contexts/                    # 全局状态管理
│   ├── TUIProvider.tsx          # 主 Provider
│   ├── FocusContext.tsx         # 焦点管理
│   ├── ViewContext.tsx          # 视图路由
│   ├── ModalContext.tsx         # 弹窗管理
│   └── ToastContext.tsx         # 通知管理
│
├── hooks/                       # 自定义 Hooks
│   ├── useFocus.ts              # 焦点管理
│   ├── useModal.ts              # 弹窗操作
│   ├── useToast.ts              # 通知操作
│   ├── useLayout.ts             # 响应式布局
│   ├── useKeyboard.ts           # 键盘快捷键
│   ├── useTerminal.ts           # 终端信息
│   └── useViewport.ts           # 视口计算
│
├── components/                  # 组件
│   ├── layout/                  # 布局组件
│   │   ├── RootLayout.tsx       # 根布局
│   │   ├── Header.tsx           # 顶部栏
│   │   ├── Footer.tsx           # 底部栏
│   │   ├── Sidebar.tsx          # 侧边栏容器
│   │   ├── MainContent.tsx      # 主内容区
│   │   └── BottomPanel.tsx      # 底部面板
│   │
│   ├── ui/                      # UI 组件
│   │   ├── Box.tsx              # 增强 Box
│   │   ├── Text.tsx             # 增强 Text
│   │   ├── Focusable.tsx        # 可聚焦容器
│   │   ├── Scrollable.tsx       # 可滚动容器
│   │   └── Selectable.tsx       # 可选择列表
│   │
│   ├── modal/                   # 弹窗组件
│   │   ├── ModalContainer.tsx   # 弹窗容器
│   │   ├── ModalOverlay.tsx     # 遮罩层
│   │   ├── CommandPalette.tsx   # 命令面板（重构）
│   │   ├── ConfirmDialog.tsx    # 确认对话框（重构）
│   │   └── InputDialog.tsx      # 输入对话框
│   │
│   ├── toast/                   # 通知组件
│   │   ├── ToastContainer.tsx   # 通知容器
│   │   ├── Toast.tsx            # 单条通知
│   │   └── ToastProgress.tsx    # 进度条
│   │
│   ├── panel/                   # 面板组件
│   │   ├── MainPanel.tsx        # 主面板（重构）
│   │   ├── TaskPanel.tsx        # 任务面板（重构）
│   │   ├── MessagePanel.tsx     # 消息面板
│   │   ├── CalendarPanel.tsx    # 日历面板
│   │   └── EmailPanel.tsx       # 邮件面板
│   │
│   └── input/                   # 输入组件
│       ├── InputBar.tsx         # 输入栏（重构）
│       ├── SuggestionList.tsx   # 建议列表
│       └── KeyBindingHelp.tsx   # 快捷键帮助
│
├── views/                       # 视图页面
│   ├── ChatView.tsx             # 聊天视图
│   ├── TaskView.tsx             # 任务视图
│   ├── CalendarView.tsx         # 日历视图
│   └── SettingsView.tsx         # 设置视图
│
├── workbench/                   # 工作台专用
│   ├── components/              # 工作台组件
│   │   ├── TopBar.tsx
│   │   ├── LeftNav.tsx
│   │   ├── DashboardView.tsx
│   │   ├── MessagesView.tsx
│   │   ├── TasksView.tsx
│   │   ├── WorkflowsView.tsx
│   │   ├── TeamView.tsx
│   │   ├── RightSidebar.tsx
│   │   ├── BottomBar.tsx
│   │   ├── CommandPalette.tsx
│   │   └── NotificationsPanel.tsx
│   └── hooks/                   # 工作台 Hooks
│       └── useWorkbench.ts
│
└── utils/                       # 工具函数
    ├── focus.ts                 # 焦点工具
    ├── layout.ts                # 布局计算
    ├── keyboard.ts              # 键盘处理
    └── animation.ts             # 动画效果
```

---

## 重构工作流

### 阶段 1: 核心架构搭建 (2-3 天)

#### 任务 1.1: 创建全局状态系统
- [ ] 实现 `TUIProvider` - 全局配置和状态
- [ ] 实现 `FocusProvider` - 焦点管理
- [ ] 实现 `ViewProvider` - 视图路由
- [ ] 实现 `ToastProvider` - 通知管理

#### 任务 1.2: 创建核心 Hooks
- [ ] `useFocus` - 注册/注销焦点区域
- [ ] `useModal` - 打开/关闭/管理弹窗
- [ ] `useToast` - 显示通知
- [ ] `useLayout` - 响应式布局计算
- [ ] `useKeyboard` - 全局键盘监听

#### 任务 1.3: 创建布局组件
- [ ] `RootLayout` - 根布局容器
- [ ] `Focusable` - 可聚焦容器（带视觉反馈）
- [ ] `Scrollable` - 可滚动容器（带滚动指示）

### 阶段 2: 弹窗系统重构 (1-2 天)

#### 任务 2.1: Modal 系统
- [ ] `ModalContainer` - 弹窗容器和层级管理
- [ ] `ModalOverlay` - 遮罩层
- [ ] 重构 `CommandPalette` - 使用新系统
- [ ] 重构 `ConfirmDialog` - 使用新系统

#### 任务 2.2: Toast 系统
- [ ] `ToastContainer` - 通知队列管理
- [ ] `Toast` - 单条通知组件
- [ ] 实现自动消失和进度条

### 阶段 3: 面板组件重构 (2-3 天)

#### 任务 3.1: 主面板
- [ ] 重构 `MainPanel` - 简化逻辑，使用新 Hooks
- [ ] 实现焦点感知滚动
- [ ] 优化消息渲染性能

#### 任务 3.2: 任务面板
- [ ] 重构 `TaskPanel` - 简化逻辑
- [ ] 统一键盘导航
- [ ] 添加焦点指示器

#### 任务 3.3: 侧边栏
- [ ] 重构 `Sidebar` - Tab 切换优化
- [ ] 焦点管理和切换动画

### 阶段 4: Workbench 重构 (2-3 天)

#### 任务 4.1: 拆分巨型组件
- [ ] 将 `Workbench.tsx` 拆分为独立组件
- [ ] 每个视图独立文件
- [ ] 创建 `useWorkbench` Hook

#### 任务 4.2: 统一导航
- [ ] 实现视图路由系统
- [ ] 统一快捷键处理
- [ ] 添加面包屑导航

### 阶段 5: 整合与优化 (1-2 天)

#### 任务 5.1: 整合 App.tsx
- [ ] 简化 App.tsx 到 100 行以内
- [ ] 所有状态迁移到 Context

#### 任务 5.2: 性能优化
- [ ] 添加 React.memo 优化
- [ ] 虚拟列表（消息多的时候）
- [ ] 减少不必要的重渲染

#### 任务 5.3: 测试
- [ ] 单元测试
- [ ] 集成测试
- [ ] 手动测试

---

## 关键设计决策

### 1. 焦点管理策略

```typescript
// 焦点自动分配算法
function autoAssignFocus() {
  const candidates = focusRegistry
    .getAll()
    .filter(z => z.layer <= currentMaxLayer)
    .sort((a, b) => {
      // 先按层级排序，再按优先级排序
      if (a.layer !== b.layer) return b.layer - a.layer;
      return b.priority - a.priority;
    });
  
  if (candidates.length > 0) {
    setActiveFocus(candidates[0].id);
  }
}

// 当弹窗打开时，自动提升最大层级
// 当弹窗关闭时，自动降低最大层级并重新分配焦点
```

### 2. 键盘事件处理策略

```typescript
// 键盘事件冒泡处理
function handleKeyInput(key: Key) {
  // 1. 先检查活动焦点区域是否处理
  const activeZone = getActiveFocus();
  if (activeZone?.onKey?.(key)) {
    return; // 已处理
  }
  
  // 2. 检查全局快捷键
  if (handleGlobalShortcut(key)) {
    return;
  }
  
  // 3. 默认处理
  handleDefaultKey(key);
}

// 全局快捷键定义
const globalShortcuts: Shortcut[] = [
  { key: 'tab', action: 'toggleCommandPalette' },
  { key: 'escape', action: 'closeModalOrExit' },
  { key: 'ctrl+c', action: 'copy' },
  { key: 'ctrl+v', action: 'paste' },
  { key: 'f1', action: 'showHelp' },
];
```

### 3. 响应式布局策略

```typescript
// 布局自动调整
function calculateLayout(terminalSize: Size): LayoutConfig {
  const { width, height } = terminalSize;
  
  // 断点判断
  let breakpoint = Breakpoint.NORMAL;
  if (width < 80) breakpoint = Breakpoint.COMPACT;
  else if (width > 120) breakpoint = Breakpoint.WIDE;
  
  // 根据断点调整布局
  return {
    breakpoint,
    sidebar: {
      visible: width >= 80,
      width: Math.min(40, Math.max(25, Math.floor(width * 0.25))),
      position: 'right',
    },
    panels: {
      bottom: {
        visible: height >= 30,
        height: Math.min(15, Math.max(8, Math.floor(height * 0.25))),
      },
      right: { visible: false, width: 0 },
    },
    input: {
      position: 'bottom',
      height: 3,
    },
  };
}
```

---

## 迁移策略

### 渐进式迁移

1. **创建新目录结构** - 不删除旧代码
2. **逐个组件迁移** - 从底层开始
3. **并行运行** - 新旧代码同时存在
4. **逐步切换** - 测试通过后切换
5. **清理旧代码** - 全部迁移完成后删除

### 向后兼容

- 保持现有命令接口不变
- 保持现有配置文件格式
- 提供迁移指南

---

## 预期效果

### 代码质量
- App.tsx: 400+ 行 → < 100 行
- Workbench.tsx: 703 行 → 分解为多个 < 200 行的组件
- 测试覆盖率: 提升至 80%+

### 用户体验
- 焦点指示器清晰明确
- 键盘导航流畅无冲突
- 响应式适配更完善
- 弹窗层级管理有序

### 可维护性
- 职责分离清晰
- 新增功能更容易
- Bug 定位和修复更快
