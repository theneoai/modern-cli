/**
 * NotesView.tsx - 快速笔记视图 (第四个 Mode)
 *
 * 键盘操作:
 *   j/k         导航笔记列表
 *   Enter       查看/展开选中笔记
 *   n           新建笔记 (跳到输入栏)
 *   d           删除笔记
 *   /           搜索过滤
 *   y           复制笔记内容
 *   t           给笔记打标签
 *   p           置顶笔记
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme } from '../../theme/index.js';

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface NotesViewProps {
  notes: Note[];
  height: number;
  width: number;
  isFocused: boolean;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
  onAddTag: (id: string, tag: string) => void;
}

export function NotesView({
  notes, height, width, isFocused,
  onDelete, onPin,
}: NotesViewProps) {
  const [cursor, setCursor] = useState(0);
  const [, setExpanded] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);
  const [notification, setNotification] = useState('');

  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    };
  }, []);

  const notify = useCallback((msg: string) => {
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    setNotification(msg);
    notifyTimerRef.current = setTimeout(() => setNotification(''), 2000);
  }, []);

  // Sort: pinned first, then by date
  const displayNotes = useMemo(() => {
    let list = [...notes];
    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      list = list.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
  }, [notes, filterQuery]);

  const safeIdx = Math.min(cursor, Math.max(0, displayNotes.length - 1));
  const selectedNote = displayNotes[safeIdx];

  // Vertical split: list (40%) | detail (60%)
  const listWidth = Math.floor(width * 0.38);
  const listHeight = height - 4;

  useInput((ch, key) => {
    if (!isFocused) return;

    if (isFiltering) {
      if (key.escape || key.return) { setIsFiltering(false); return; }
      if (key.backspace) { setFilterQuery(prev => prev.slice(0, -1)); return; }
      if (ch && !key.ctrl) { setFilterQuery(prev => prev + ch); }
      return;
    }

    if (key.upArrow || ch === 'k') {
      setCursor(prev => Math.max(0, prev - 1));
      setExpanded(null);
    } else if (key.downArrow || ch === 'j') {
      setCursor(prev => Math.min(displayNotes.length - 1, prev + 1));
      setExpanded(null);
    } else if (key.return || ch === ' ') {
      if (selectedNote) {
        setExpanded(prev => prev === selectedNote.id ? null : selectedNote.id);
      }
    } else if (ch === 'd' && selectedNote) {
      onDelete(selectedNote.id);
      setCursor(prev => Math.max(0, prev - 1));
      notify('🗑 已删除');
    } else if (ch === 'p' && selectedNote) {
      onPin(selectedNote.id);
      notify(selectedNote.pinned ? '取消置顶' : '📌 已置顶');
    } else if (ch === '/') {
      setIsFiltering(true);
      setFilterQuery('');
    } else if (ch === 'g') {
      setCursor(0);
    } else if (ch === 'G') {
      setCursor(Math.max(0, displayNotes.length - 1));
    }
  });

  return (
    <Box
      flexDirection="column"
      height={height}
      width={width}
      borderStyle="single"
      borderColor={isFocused ? theme.colors.primary : theme.colors.border}
    >
      {/* Header */}
      <Box height={1} flexShrink={0} paddingX={1}>
        <Text color={isFocused ? theme.colors.accent : theme.colors.muted} bold>
          {isFocused ? '● ' : '○ '}笔记
        </Text>
        <Text color={theme.colors.muted}> {displayNotes.length} 条</Text>
        {filterQuery && <Text color={theme.colors.warning}> 过滤: "{filterQuery}"</Text>}
        {notification && <Text color={theme.colors.success}>  {notification}</Text>}
      </Box>

      {/* Filter input */}
      {isFiltering && (
        <Box height={1} flexShrink={0} paddingX={1}>
          <Text color={theme.colors.primary}>/ </Text>
          <Text color={theme.colors.text}>{filterQuery}</Text>
          <Text backgroundColor={theme.colors.primary} color={theme.colors.background}> </Text>
        </Box>
      )}

      {/* Split view */}
      <Box flexDirection="row" flexGrow={1} overflow="hidden">
        {/* Left: note list */}
        <Box
          flexDirection="column"
          width={listWidth}
          borderStyle="single"
          borderColor={theme.colors.border}
          paddingX={1}
        >
          {displayNotes.length === 0 ? (
            <Box marginTop={2}>
              <Text color={theme.colors.muted}>
                {filterQuery ? '无匹配笔记' : '暂无笔记'}{'\n'}
                {'\n'}
                输入: note 内容{'\n'}
                命令: /note 内容
              </Text>
            </Box>
          ) : (
            displayNotes.slice(0, listHeight).map((note, idx) => {
              const isSelected = isFocused && idx === safeIdx;
              const maxTitle = listWidth - 6;
              const title = note.title.length > maxTitle
                ? note.title.slice(0, maxTitle - 1) + '…'
                : note.title;
              return (
                <Box
                  key={note.id}
                  paddingX={isSelected ? 1 : 0}
                  backgroundColor={isSelected ? theme.colors.surfaceLight : undefined}
                >
                  <Text color={isSelected ? theme.colors.primary : 'transparent'}>
                    {isSelected ? '❯ ' : '  '}
                  </Text>
                  {note.pinned && <Text color={theme.colors.warning}>📌</Text>}
                  <Text
                    color={isSelected ? theme.colors.text : theme.colors.muted}
                    bold={isSelected}
                  >
                    {title}
                  </Text>
                </Box>
              );
            })
          )}
        </Box>

        {/* Right: note detail */}
        <Box
          flexDirection="column"
          flexGrow={1}
          paddingX={1}
          overflow="hidden"
        >
          {selectedNote ? (
            <>
              <Box marginBottom={1}>
                <Text color={theme.colors.accent} bold>{selectedNote.title}</Text>
                {selectedNote.tags.length > 0 && (
                  <Text color={theme.colors.info}> [{selectedNote.tags.join(', ')}]</Text>
                )}
              </Box>
              <Box>
                <Text color={theme.colors.text}>{selectedNote.content}</Text>
              </Box>
              <Box marginTop={1}>
                <Text color={theme.colors.muted}>
                  {formatRelTime(selectedNote.updatedAt)}
                </Text>
              </Box>
            </>
          ) : (
            <Box marginTop={2}>
              <Text color={theme.colors.muted}>← 选择一条笔记查看内容</Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* Footer */}
      <Box height={1} flexShrink={0} paddingX={1}>
        {isFocused ? (
          <Text color={theme.colors.muted}>j/k:导航 Enter:展开 p:置顶 d:删除 /:搜索 note 内容:快速记录</Text>
        ) : (
          <Text color={theme.colors.muted}>Tab:聚焦笔记面板</Text>
        )}
      </Box>
    </Box>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatRelTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}
