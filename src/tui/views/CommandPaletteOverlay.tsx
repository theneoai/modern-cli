/**
 * CommandPaletteOverlay.tsx - Ctrl+K 命令面板
 * 模糊搜索 + 分类展示全部命令
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
  // 视图切换
  { label: '对话 CHAT',   value: '/chat',   desc: 'AI 流式对话',          icon: '💬', category: '视图', shortcut: 'Ctrl+1' },
  { label: '任务 TASKS',  value: '/tasks',  desc: 'Vim 风格任务管理',       icon: '✓',  category: '视图', shortcut: 'Ctrl+2' },
  { label: '笔记 NOTES',  value: '/notes',  desc: '快速笔记双栏视图',       icon: '📝', category: '视图', shortcut: 'Ctrl+3' },
  { label: 'AGENTS',     value: '/agents', desc: '6 个内置 AI Agent',      icon: '⚙',  category: '视图', shortcut: 'Ctrl+4' },

  // AI 对话
  { label: '新建对话',    value: '/new',    desc: '清空历史开始新对话',      icon: '✦',  category: 'AI',  shortcut: 'Ctrl+N' },
  { label: '清空对话',    value: '/clear',  desc: '清空当前对话',            icon: '○',  category: 'AI',  shortcut: 'Ctrl+L' },

  // 效率工具
  { label: '今日规划',    value: '/plan',      desc: 'AI 生成今日时间块计划',  icon: '📅', category: '效率' },
  { label: '站会内容',    value: '/standup',   desc: 'AI 生成站会发言稿',     icon: '🗣', category: '效率' },
  { label: '每日回顾',    value: '/review',    desc: 'AI 分析今日完成情况',   icon: '🔄', category: '效率' },
  { label: '番茄 25min', value: '/timer 25',  desc: '开始 25 分钟专注计时',  icon: '⏱', category: '效率' },
  { label: '休息 5min',  value: '/timer 5',   desc: '开始 5 分钟休息计时',   icon: '☕', category: '效率' },
  { label: '停止计时',    value: '/stop',      desc: '停止当前番茄计时',      icon: '⏹', category: '效率' },

  // 任务
  { label: '创建任务',    value: '/task ',     desc: '添加新任务 (补充标题)', icon: '＋', category: '任务' },

  // 笔记
  { label: '快速记录',    value: '/note ',     desc: '添加笔记 (补充内容)',   icon: '✏', category: '笔记' },

  // 开发
  { label: '代码生成',    value: '/code ',     desc: '用 AI 实现功能代码',    icon: '⚙', category: '开发' },
  { label: '调试助手',    value: '/debug ',    desc: '分析错误并给出修复方案', icon: '🔧', category: '开发' },
  { label: '代码解释',    value: '/explain ',  desc: '解释代码或技术概念',    icon: '💡', category: '开发' },
  { label: '代码重构',    value: '/refactor ', desc: '重构优化代码质量',      icon: '♻', category: '开发' },

  // 写作
  { label: '内容写作',    value: '/write ',    desc: '生成各类文字内容',      icon: '✍', category: '写作' },
  { label: '深度研究',    value: '/research ', desc: '深入分析某个主题',      icon: '🔍', category: '写作' },
  { label: '内容总结',    value: '/summary ',  desc: '提炼核心要点',          icon: '📋', category: '写作' },
  { label: '翻译',        value: '/translate ',desc: '中英文互译',            icon: '🌐', category: '写作' },

  // 系统
  { label: '快捷键帮助',  value: '/help',   desc: '查看完整快捷键参考',      icon: '?',  category: '系统', shortcut: '?' },
  { label: '退出',        value: '/exit',   desc: '退出 HyperTerminal',      icon: '×',  category: '系统' },
];

interface CommandPaletteOverlayProps {
  width: number;
  height: number;
  mode: AppMode;
  onSelect: (value: string) => void;
  onClose: () => void;
}

export function CommandPaletteOverlay({
  width, height, onSelect, onClose,
}: CommandPaletteOverlayProps) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  const filtered = useMemo(() => {
    if (!query) return ALL_COMMANDS;
    const q = query.toLowerCase();
    return ALL_COMMANDS.filter(c =>
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
    if (key.upArrow) { setCursor(prev => Math.max(0, prev - 1)); return; }
    if (key.downArrow) { setCursor(prev => Math.min(filtered.length - 1, prev + 1)); return; }
    if (key.return) {
      const item = filtered[safeCursor];
      if (item) onSelect(item.value);
      return;
    }
    if (key.backspace) { setQuery(prev => prev.slice(0, -1)); setCursor(0); return; }
    if (ch && !key.ctrl && !key.meta) { setQuery(prev => prev + ch); setCursor(0); }
  });

  // Collect unique categories for display
  const cats = [...new Set(ALL_COMMANDS.map(c => c.category))];

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
      {/* Title bar */}
      <Box height={1} paddingX={2} alignItems="center">
        <Text color={theme.colors.primary} bold>⌘ 命令面板</Text>
        <Text color={theme.colors.muted}> {filtered.length}/{ALL_COMMANDS.length} 命令</Text>
        <Box flexGrow={1} justifyContent="flex-end">
          <Text color={theme.colors.muted}>ESC 关闭</Text>
        </Box>
      </Box>

      {/* Search box */}
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
          <Text color={theme.colors.muted}>输入命令名 / 描述 / 分类...</Text>
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
            <Text color={theme.colors.muted}>无匹配: "{query}"</Text>
          </Box>
        ) : (
          visible.map((item, idx) => {
            const actualIdx = scrollStart + idx;
            const isSel = actualIdx === safeCursor;
            return (
              <Box
                key={`${item.value}-${item.label}`}
                paddingX={1}
                backgroundColor={isSel ? theme.colors.primary : undefined}
              >
                <Text color={isSel ? theme.colors.background : theme.colors.muted}>
                  {item.icon}
                </Text>
                <Text
                  color={isSel ? theme.colors.background : theme.colors.text}
                  bold={isSel}
                >
                  {'  '}{item.label}
                </Text>
                <Text color={isSel ? theme.colors.background : theme.colors.muted}>
                  {'  '}{item.desc}
                </Text>
                {item.shortcut && !isSel && (
                  <Text color={theme.colors.border}> [{item.shortcut}]</Text>
                )}
                {!query && !isSel && (
                  <Text color={theme.colors.border}> {item.category}</Text>
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
          <Text color={theme.colors.muted}>  {cats.join(' · ')}</Text>
        )}
      </Box>
    </Box>
  );
}
