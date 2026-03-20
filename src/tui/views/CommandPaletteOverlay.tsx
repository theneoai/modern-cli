/**
 * CommandPaletteOverlay.tsx - Ctrl+K 命令面板
 *
 * 模糊搜索 + 分类展示所有可用命令
 * 按 Enter 执行, ESC 关闭
 */

import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme } from '../../theme/index.js';
import type { AppMode } from '../FlowApp.js';

interface PaletteItem {
  label: string;
  value: string;
  desc: string;
  icon: string;
  category: string;
  shortcut?: string;
}

const ALL_COMMANDS: PaletteItem[] = [
  // Mode switching
  { label: '对话模式', value: '/chat', desc: '切换到 AI 对话视图', icon: '💬', category: '视图', shortcut: 'Ctrl+1' },
  { label: '任务模式', value: '/tasks', desc: '切换到任务管理视图', icon: '✓', category: '视图', shortcut: 'Ctrl+2' },
  { label: 'Agent 模式', value: '/agents', desc: '切换到 AI Agent 视图', icon: '⚙', category: '视图', shortcut: 'Ctrl+3' },

  // AI actions
  { label: '新建对话', value: '/new', desc: '清空历史, 开始新对话', icon: '✦', category: 'AI', shortcut: 'Ctrl+N' },
  { label: '清空对话', value: '/clear', desc: '清空当前对话内容', icon: '○', category: 'AI', shortcut: 'Ctrl+L' },
  { label: '研究员 Agent', value: '/agents', desc: '启动研究员 Agent 分析任务', icon: '🔍', category: 'AI' },
  { label: '工程师 Agent', value: '/agents', desc: '启动工程师 Agent 编写代码', icon: '⚙', category: 'AI' },

  // Tasks
  { label: '创建任务', value: '/task ', desc: '快速创建新任务 (补充标题)', icon: '＋', category: '任务' },
  { label: '查看任务', value: '/tasks', desc: '查看所有待处理任务', icon: '≡', category: '任务' },

  // System
  { label: '查看帮助', value: '/help', desc: '键盘快捷键完整参考', icon: '?', category: '系统', shortcut: '?' },
  { label: '退出程序', value: '/exit', desc: '退出 HyperTerminal', icon: '×', category: '系统' },
];

interface CommandPaletteOverlayProps {
  width: number;
  height: number;
  mode: AppMode;
  onSelect: (value: string) => void;
  onClose: () => void;
}

export function CommandPaletteOverlay({
  width, height, mode, onSelect, onClose,
}: CommandPaletteOverlayProps) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  // Fuzzy filter
  const filtered = useMemo(() => {
    if (!query) return ALL_COMMANDS;
    const q = query.toLowerCase();
    return ALL_COMMANDS.filter(
      c =>
        c.label.toLowerCase().includes(q) ||
        c.desc.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.value.toLowerCase().includes(q)
    );
  }, [query]);

  const safeCursor = Math.min(cursor, Math.max(0, filtered.length - 1));
  const listHeight = height - 7;
  const scrollStart = Math.max(0, safeCursor - Math.floor(listHeight / 2));
  const visible = filtered.slice(scrollStart, scrollStart + listHeight);

  useInput((ch, key) => {
    if (key.escape) { onClose(); return; }

    if (key.upArrow) {
      setCursor(prev => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setCursor(prev => Math.min(filtered.length - 1, prev + 1));
      return;
    }

    if (key.return) {
      const item = filtered[safeCursor];
      if (item) onSelect(item.value);
      return;
    }

    if (key.backspace) {
      setQuery(prev => prev.slice(0, -1));
      setCursor(0);
      return;
    }

    if (ch && !key.ctrl && !key.meta) {
      setQuery(prev => prev + ch);
      setCursor(0);
    }
  });

  // Group by category for display
  const categories = [...new Set(ALL_COMMANDS.map(c => c.category))];

  return (
    <Box
      position="absolute"
      marginLeft={Math.max(0, Math.floor((100 - width) / 4))}
      marginTop={2}
      width={width}
      height={height}
      flexDirection="column"
      borderStyle="double"
      borderColor={theme.colors.primary}
      backgroundColor={theme.colors.surface}
    >
      {/* Header */}
      <Box height={1} paddingX={2} alignItems="center">
        <Text color={theme.colors.primary} bold>⌘ 命令面板</Text>
        <Text color={theme.colors.muted}> — {filtered.length} 个命令</Text>
        <Box flexGrow={1} justifyContent="flex-end">
          <Text color={theme.colors.muted}>ESC 关闭</Text>
        </Box>
      </Box>

      {/* Search input */}
      <Box
        height={3}
        borderStyle="single"
        borderColor={theme.colors.primary}
        paddingX={1}
        marginX={1}
        alignItems="center"
      >
        <Text color={theme.colors.primary}>🔍 </Text>
        {query.length === 0 ? (
          <Text color={theme.colors.muted}>输入命令名称或描述...</Text>
        ) : (
          <>
            <Text color={theme.colors.text}>{query}</Text>
            <Text color={theme.colors.background} backgroundColor={theme.colors.primary}> </Text>
          </>
        )}
      </Box>

      {/* Results */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden" paddingX={1} marginTop={1}>
        {filtered.length === 0 ? (
          <Box marginTop={1}>
            <Text color={theme.colors.muted}>无匹配命令 "{query}"</Text>
          </Box>
        ) : (
          visible.map((item, idx) => {
            const actualIdx = scrollStart + idx;
            const isSelected = actualIdx === safeCursor;
            return (
              <Box
                key={item.value + item.label}
                paddingX={1}
                backgroundColor={isSelected ? theme.colors.primary : undefined}
              >
                <Text color={isSelected ? theme.colors.background : theme.colors.text}>
                  {item.icon}
                </Text>
                <Text
                  color={isSelected ? theme.colors.background : theme.colors.text}
                  bold={isSelected}
                >
                  {' '}{item.label}
                </Text>
                <Text color={isSelected ? theme.colors.background : theme.colors.muted}>
                  {' — '}{item.desc}
                </Text>
                {item.shortcut && !isSelected && (
                  <Text color={theme.colors.border}> [{item.shortcut}]</Text>
                )}
              </Box>
            );
          })
        )}
      </Box>

      {/* Footer */}
      <Box height={1} paddingX={2}>
        <Text color={theme.colors.muted}>↑↓:选择  Enter:执行  ESC:取消</Text>
        {!query && (
          <Text color={theme.colors.muted}>  类别: {categories.join(' · ')}</Text>
        )}
      </Box>
    </Box>
  );
}
