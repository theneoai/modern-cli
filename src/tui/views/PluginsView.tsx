/**
 * PluginsView.tsx - 插件管理 + 插件内容面板 (第五模式: PLUGINS)
 *
 * 键盘操作:
 *   j/k         导航插件列表
 *   Enter/Space 切换启用/禁用
 *   Tab         在插件列表和插件内容之间切换焦点
 *   d           查看插件详情
 *   r           刷新插件内容
 *
 * 布局 (左右双栏):
 * ┌─ 插件列表 ──┬─ 插件内容 ──────────────────────────────┐
 * │ ● 邮件提醒 │  === 天气时间插件 ===                    │
 * │ ● Token统计│  📅 2026年3月20日 周五                   │
 * │ ● 天气时间 │  🕐 本地 14:32:55                       │
 * └────────────┴────────────────────────────────────────┘
 */

import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme } from '../../theme/index.js';
import type { LoadedPlugin, StatusContext } from '../../sdk/plugin.js';

interface PluginsViewProps {
  plugins: LoadedPlugin[];
  height: number;
  width: number;
  isFocused: boolean;
  onToggle: (id: string) => Promise<void>;
  statusCtx: StatusContext;
}

export function PluginsView({
  plugins, height, width, isFocused, onToggle, statusCtx,
}: PluginsViewProps) {
  const [cursor, setCursor] = useState(0);
  const [focusPane, setFocusPane] = useState<'list' | 'content'>('list');
  const [notification, setNotification] = useState('');

  const notify = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 2000);
  }, []);

  const selectedPlugin = plugins[Math.min(cursor, plugins.length - 1)];

  const listWidth = Math.min(28, Math.floor(width * 0.30));
  const listHeight = height - 4;

  useInput((ch, key) => {
    if (!isFocused) return;

    if (key.tab) {
      setFocusPane(prev => prev === 'list' ? 'content' : 'list');
      return;
    }

    if (focusPane === 'list') {
      if (key.upArrow || ch === 'k') {
        setCursor(prev => Math.max(0, prev - 1));
      } else if (key.downArrow || ch === 'j') {
        setCursor(prev => Math.min(plugins.length - 1, prev + 1));
      } else if (key.return || ch === ' ') {
        if (selectedPlugin) {
          void onToggle(selectedPlugin.def.id).then(() => {
            notify(selectedPlugin.enabled ? '○ 已禁用' : '● 已启用');
          });
        }
      }
    }
  });

  // Get view lines from selected plugin
  const viewLines = selectedPlugin?.enabled && selectedPlugin.def.viewLines
    ? selectedPlugin.def.viewLines(statusCtx)
    : [];

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
          {isFocused ? '● ' : '○ '}插件管理
        </Text>
        <Text color={theme.colors.muted}>
          {' '}{plugins.filter(p => p.enabled).length}/{plugins.length} 已启用
        </Text>
        {notification && <Text color={theme.colors.success}>  {notification}</Text>}
      </Box>

      {/* Main split */}
      <Box flexDirection="row" flexGrow={1} overflow="hidden">
        {/* Left: plugin list */}
        <Box
          flexDirection="column"
          width={listWidth}
          borderStyle="single"
          borderColor={focusPane === 'list' && isFocused ? theme.colors.primary : theme.colors.border}
          paddingX={1}
        >
          <Box height={1} flexShrink={0}>
            <Text color={theme.colors.muted} bold>插件列表</Text>
          </Box>
          {plugins.length === 0 ? (
            <Text color={theme.colors.muted}>无插件</Text>
          ) : (
            plugins.slice(0, listHeight).map((p, idx) => {
              const isSel = isFocused && focusPane === 'list' && idx === cursor;
              const maxName = listWidth - 6;
              const name = p.def.name.length > maxName ? p.def.name.slice(0, maxName - 1) + '…' : p.def.name;
              return (
                <Box
                  key={p.def.id}
                  paddingX={isSel ? 1 : 0}
                  backgroundColor={isSel ? theme.colors.surfaceLight : undefined}
                >
                  <Text color={p.enabled ? theme.colors.success : theme.colors.muted}>
                    {p.enabled ? '●' : '○'}{' '}
                  </Text>
                  <Text
                    color={isSel ? theme.colors.text : theme.colors.muted}
                    bold={isSel}
                  >
                    {name}
                  </Text>
                </Box>
              );
            })
          )}
        </Box>

        {/* Right: plugin detail / view */}
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="single"
          borderColor={focusPane === 'content' && isFocused ? theme.colors.primary : theme.colors.border}
          paddingX={1}
          overflow="hidden"
        >
          {selectedPlugin ? (
            <>
              {/* Plugin header */}
              <Box flexDirection="column" marginBottom={1}>
                <Box>
                  <Text color={selectedPlugin.enabled ? theme.colors.success : theme.colors.muted}>
                    {selectedPlugin.enabled ? '● ' : '○ '}
                  </Text>
                  <Text color={theme.colors.accent} bold>{selectedPlugin.def.name}</Text>
                  <Text color={theme.colors.muted}> v{selectedPlugin.def.version}</Text>
                </Box>
                <Text color={theme.colors.muted}>{selectedPlugin.def.description}</Text>
                {selectedPlugin.def.tags && (
                  <Text color={theme.colors.border}>
                    [{selectedPlugin.def.tags.join(', ')}]
                  </Text>
                )}
              </Box>

              {/* Commands */}
              {selectedPlugin.def.commands && (
                <Box flexDirection="column" marginBottom={1}>
                  <Text color={theme.colors.info} bold>命令:</Text>
                  {Object.keys(selectedPlugin.def.commands).map(cmd => (
                    <Text key={cmd} color={theme.colors.primary}>  /{cmd}</Text>
                  ))}
                </Box>
              )}

              {/* MCP Skills */}
              {selectedPlugin.def.skills && selectedPlugin.def.skills.length > 0 && (
                <Box flexDirection="column" marginBottom={1}>
                  <Text color={theme.colors.info} bold>AI 工具 (MCP):</Text>
                  {selectedPlugin.def.skills.flatMap(s => s.tools).map(t => (
                    <Text key={t.name} color={theme.colors.muted}>  🔧 {t.name}</Text>
                  ))}
                </Box>
              )}

              {/* Dynamic view lines */}
              {viewLines.length > 0 && (
                <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.border} paddingX={1} marginTop={1}>
                  {viewLines.map((line, i) => (
                    <Text key={i} color={line.startsWith('  ===') ? theme.colors.accent : theme.colors.text}>
                      {line}
                    </Text>
                  ))}
                </Box>
              )}
            </>
          ) : (
            <Box marginTop={2}>
              <Text color={theme.colors.muted}>← 选择插件查看详情</Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* Footer */}
      <Box height={1} flexShrink={0} paddingX={1}>
        {isFocused ? (
          <Text color={theme.colors.muted}>
            j/k:选择 Space:启用/禁用 Tab:切换焦点
            {'  '}
            <Text color={theme.colors.accent}>开发插件: src/tui/plugins/</Text>
          </Text>
        ) : (
          <Text color={theme.colors.muted}>Tab:聚焦插件面板</Text>
        )}
      </Box>
    </Box>
  );
}
