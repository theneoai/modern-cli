/**
 * HelpOverlay.tsx - 键盘快捷键参考面板
 * 按 ? 或 /help 显示
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme } from '../../theme/index.js';

interface HelpOverlayProps {
  width: number;
  height: number;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  icon: string;
  items: { key: string; desc: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: '全局快捷键',
    icon: '◆',
    items: [
      { key: 'Ctrl+K', desc: '打开命令面板' },
      { key: '?', desc: '显示此帮助 (内容面板未聚焦时)' },
      { key: 'Tab', desc: '切换焦点: 输入栏 ↔ 内容面板' },
      { key: 'ESC', desc: '取消 / 返回输入栏' },
      { key: 'Ctrl+1', desc: '切换到对话模式' },
      { key: 'Ctrl+2', desc: '切换到任务模式' },
      { key: 'Ctrl+3', desc: '切换到 Agent 模式' },
      { key: 'Ctrl+N', desc: '新建对话' },
      { key: 'Ctrl+L', desc: '清空当前视图' },
    ],
  },
  {
    title: '对话模式 (CHAT)',
    icon: '💬',
    items: [
      { key: 'Enter', desc: '发送消息 / 与 AI 对话' },
      { key: '↑ / ↓', desc: '历史记录导航' },
      { key: 'Tab (内容)', desc: '聚焦消息列表' },
      { key: 'j / k', desc: '上下滚动消息' },
      { key: 'g / G', desc: '跳到顶部 / 底部' },
      { key: 'Ctrl+U / Ctrl+D', desc: '半页上下滚动' },
      { key: 'PgUp / PgDn', desc: '整页滚动' },
      { key: 'Ctrl+U (输入)', desc: '清空输入行' },
      { key: 'Ctrl+W', desc: '删除前一个单词' },
    ],
  },
  {
    title: '任务模式 (TASKS)',
    icon: '✓',
    items: [
      { key: 'j / k  ↑↓', desc: '移动光标选择任务' },
      { key: 'Space / Enter', desc: '切换完成状态' },
      { key: 's', desc: '循环切换状态 (待处理→进行中→完成)' },
      { key: 'd', desc: '删除选中任务' },
      { key: '/', desc: '搜索过滤任务' },
      { key: 'v', desc: '切换显示已完成任务' },
      { key: 'gg / G', desc: '跳到列表顶部 / 底部' },
      { key: 'todo 标题', desc: '在输入栏快速创建任务' },
      { key: '/task 标题', desc: '命令方式创建任务' },
    ],
  },
  {
    title: 'Agent 模式 (AGENTS)',
    icon: '⚙',
    items: [
      { key: 'j / k  ↑↓', desc: '选择 Agent' },
      { key: 'Enter / Space', desc: '快速运行选中 Agent' },
      { key: 'i', desc: '输入自定义目标后运行' },
      { key: 'ESC', desc: '取消目标输入' },
    ],
  },
  {
    title: '命令面板 (Ctrl+K)',
    icon: '⌘',
    items: [
      { key: '输入文字', desc: '模糊搜索命令' },
      { key: '↑ / ↓', desc: '导航命令列表' },
      { key: 'Enter', desc: '执行选中命令' },
      { key: 'ESC', desc: '关闭面板' },
    ],
  },
  {
    title: '快捷命令',
    icon: '/',
    items: [
      { key: '/chat', desc: '切换到对话模式' },
      { key: '/tasks', desc: '切换到任务模式' },
      { key: '/agents', desc: '切换到 Agent 模式' },
      { key: '/task 标题', desc: '创建新任务' },
      { key: '/clear', desc: '清空对话历史' },
      { key: '/new', desc: '新建对话' },
      { key: '/help', desc: '查看帮助' },
      { key: '/exit', desc: '退出程序' },
    ],
  },
];

export function HelpOverlay({ width, height, onClose }: HelpOverlayProps) {
  useInput((ch, key) => {
    if (key.escape || ch === 'q' || ch === '?') {
      onClose();
    }
  });

  // Calculate how many groups fit
  const usableHeight = height - 4;
  const colWidth = Math.floor((width - 4) / 2);

  // Flatten all items for display
  const leftGroups = SHORTCUT_GROUPS.slice(0, 3);
  const rightGroups = SHORTCUT_GROUPS.slice(3);

  return (
    <Box
      position="absolute"
      marginLeft={2}
      marginTop={1}
      width={width}
      height={height}
      flexDirection="column"
      borderStyle="double"
      borderColor={theme.colors.primary}
      backgroundColor={theme.colors.surface}
    >
      {/* Title */}
      <Box
        height={1}
        paddingX={2}
        borderStyle="single"
        borderColor={theme.colors.border}
        alignItems="center"
      >
        <Text color={theme.colors.primary} bold>⌨  键盘快捷键参考</Text>
        <Box flexGrow={1} justifyContent="flex-end">
          <Text color={theme.colors.muted}>ESC / q / ? 关闭</Text>
        </Box>
      </Box>

      {/* Two-column layout */}
      <Box flexDirection="row" flexGrow={1} padding={1}>
        {/* Left column */}
        <Box flexDirection="column" width={colWidth} marginRight={1}>
          {leftGroups.map(group => (
            <ShortcutGroup key={group.title} group={group} width={colWidth} />
          ))}
        </Box>

        {/* Right column */}
        <Box flexDirection="column" width={colWidth}>
          {rightGroups.map(group => (
            <ShortcutGroup key={group.title} group={group} width={colWidth} />
          ))}
        </Box>
      </Box>

      {/* Footer */}
      <Box height={1} paddingX={2}>
        <Text color={theme.colors.muted}>
          心流模式: 专注输入 → Tab 聚焦内容 → ESC 返回 → Ctrl+K 快速操作
        </Text>
      </Box>
    </Box>
  );
}

function ShortcutGroup({ group, width }: { group: ShortcutGroup; width: number }) {
  const keyWidth = 18;
  const descWidth = Math.max(10, width - keyWidth - 4);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.colors.accent} bold>
        {group.icon} {group.title}
      </Text>
      {group.items.map(item => (
        <Box key={item.key}>
          <Box width={keyWidth} flexShrink={0}>
            <Text color={theme.colors.primary} bold>
              {item.key.length > keyWidth - 1
                ? item.key.slice(0, keyWidth - 2) + '…'
                : item.key}
            </Text>
          </Box>
          <Text color={theme.colors.muted}>
            {item.desc.length > descWidth
              ? item.desc.slice(0, descWidth - 1) + '…'
              : item.desc}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
