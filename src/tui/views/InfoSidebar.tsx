/**
 * InfoSidebar.tsx — 右侧信息侧栏
 *
 * 根据当前模式自适应显示不同内容:
 *   CHAT    → 待办摘要 + 近期笔记 + 情报流
 *   TASKS   → 任务统计 + 优先级分布 + 进行中详情
 *   NOTES   → 笔记列表 + 标签云
 *   AGENTS  → Agent 列表 + 运行状态
 *   PLUGINS → 插件列表 + 状态
 *
 * 布局快捷键提示:
 *   Ctrl+B       显示/隐藏侧栏
 *   Ctrl+[/]     缩小/放大侧栏
 *   Ctrl+Alt+L   循环切换布局预设
 */

import { Box, Text } from 'ink';
import { tuiTheme as theme } from '../../theme/index.js';
import type { AppMode, Task, Message } from '../FlowApp.js';
import type { Note } from './NotesView.js';
import type { AutonomousTask } from '../agents/AutonomousEngine.js';
import type { LoadedPlugin } from '../../sdk/plugin.js';
import type { LayoutPreset } from '../utils/layoutManager.js';
import { LAYOUT_PRESETS } from '../utils/layoutManager.js';
import { intelEngine } from '../intel/IntelEngine.js';

// ── Props ──────────────────────────────────────────────────────────────────────

interface InfoSidebarProps {
  mode: AppMode;
  width: number;
  height: number;
  tasks: Task[];
  notes: Note[];
  agentTasks: AutonomousTask[];
  plugins: LoadedPlugin[];
  messages: Message[];
  activePreset: LayoutPreset;
  sidebarWidth: number;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function InfoSidebar({
  mode,
  width,
  height,
  tasks,
  notes,
  agentTasks,
  plugins,
  messages,
  activePreset,
  sidebarWidth,
}: InfoSidebarProps) {
  const inner = width - 2; // minus left border + padding

  const contentHeight = height - 4; // minus header (2) + footer (2)

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor={theme.colors.border}
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      borderLeft={true}
      flexShrink={0}
    >
      {/* ── Sidebar Header ── */}
      <Box height={2} paddingX={1} flexDirection="column">
        <Box alignItems="center">
          <Text color={theme.colors.accent} bold>
            {modeIcon(mode)} {modeLabel(mode)}
          </Text>
          <Box flexGrow={1} />
          <Text color={theme.colors.muted}>{sidebarWidth}c</Text>
        </Box>
        {/* Layout preset indicator */}
        <Box>
          {LAYOUT_PRESETS.map(p => (
            <Text
              key={p.id}
              color={p.id === activePreset.id ? theme.colors.primary : theme.colors.border}
              bold={p.id === activePreset.id}
            >
              {p.icon}
            </Text>
          ))}
          <Text color={theme.colors.muted}> {activePreset.label}</Text>
        </Box>
      </Box>

      {/* ── Content (mode-specific) ── */}
      <Box flexDirection="column" height={contentHeight} overflow="hidden" paddingX={1}>
        {mode === 'chat'    && <ChatSideContent tasks={tasks} notes={notes} width={inner} height={contentHeight} messages={messages} />}
        {mode === 'tasks'   && <TasksSideContent tasks={tasks} width={inner} height={contentHeight} />}
        {mode === 'notes'   && <NotesSideContent notes={notes} width={inner} height={contentHeight} />}
        {mode === 'agents'  && <AgentsSideContent agentTasks={agentTasks} width={inner} height={contentHeight} />}
        {mode === 'plugins' && <PluginsSideContent plugins={plugins} width={inner} height={contentHeight} />}
      </Box>

      {/* ── Footer: resize hints ── */}
      <Box height={2} paddingX={1} flexDirection="column">
        <Box>
          <Text color={theme.colors.muted} dimColor>^[</Text>
          <Text color={theme.colors.border}> ◀▶ </Text>
          <Text color={theme.colors.muted} dimColor>^]</Text>
          <Box flexGrow={1} />
          <Text color={theme.colors.muted} dimColor>^B 隐藏</Text>
        </Box>
        <Text color={theme.colors.border} dimColor>^Alt+L 切换预设</Text>
      </Box>
    </Box>
  );
}

// ── Chat mode sidebar ─────────────────────────────────────────────────────────

function ChatSideContent({
  tasks, notes, width, height, messages,
}: {
  tasks: Task[];
  notes: Note[];
  width: number;
  height: number;
  messages: Message[];
}) {
  const pending = tasks.filter(t => t.status !== 'done');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const recentNotes = notes.slice(0, 3);
  const intel = intelEngine.getRecent(3);
  const aiMsgCount = messages.filter(m => m.role === 'assistant').length;

  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* Quick stats row */}
      <Box marginBottom={1}>
        <StatChip label="待办" value={pending.length} color={theme.colors.warning} />
        <Text color={theme.colors.border}> · </Text>
        <StatChip label="笔记" value={notes.length} color={theme.colors.info} />
        <Text color={theme.colors.border}> · </Text>
        <StatChip label="对话" value={aiMsgCount} color={theme.colors.success} />
      </Box>

      {/* In-progress tasks */}
      {inProgress.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <SectionHeader label="进行中" />
          {inProgress.slice(0, 3).map(t => (
            <Box key={t.id}>
              <Text color={theme.colors.warning}>▶ </Text>
              <Text color={theme.colors.text} wrap="truncate-end">
                {t.title.slice(0, width - 4)}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Pending tasks preview */}
      {pending.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <SectionHeader label={`待办 (${pending.length})`} />
          {pending.slice(0, Math.min(4, height - 14)).map(t => (
            <Box key={t.id}>
              <Text color={priorityColor(t.priority)}>
                {t.priority === 'high' ? '!' : '·'}{' '}
              </Text>
              <Text color={theme.colors.muted} wrap="truncate-end">
                {t.title.slice(0, width - 3)}
              </Text>
            </Box>
          ))}
          {pending.length > 4 && (
            <Text color={theme.colors.border} dimColor>  +{pending.length - 4} 更多</Text>
          )}
        </Box>
      )}

      {/* Recent notes */}
      {recentNotes.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <SectionHeader label="近期笔记" />
          {recentNotes.map(n => (
            <Box key={n.id}>
              <Text color={n.pinned ? theme.colors.accent : theme.colors.muted}>
                {n.pinned ? '📌' : '📝'} {n.title.slice(0, width - 4)}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Intel feed */}
      {intel.length > 0 && (
        <Box flexDirection="column">
          <SectionHeader label="情报" />
          {intel.map(item => (
            <Box key={item.id}>
              <Text color={theme.colors.info}>· </Text>
              <Text color={theme.colors.muted} wrap="truncate-end">
                {item.title.slice(0, width - 3)}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ── Tasks mode sidebar ────────────────────────────────────────────────────────

function TasksSideContent({ tasks, width: _width, height: _height }: {
  tasks: Task[];
  width: number;
  height: number;
}) {
  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'done').length;
  const inProg = tasks.filter(t => t.status === 'in_progress').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const high = tasks.filter(t => t.priority === 'high' && t.status !== 'done').length;
  const normal = tasks.filter(t => t.priority === 'normal' && t.status !== 'done').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const barLen = Math.max(4, _width - 2);
  const filled = Math.round((pct / 100) * barLen);
  const progressBar = '█'.repeat(filled) + '░'.repeat(barLen - filled);

  return (
    <Box flexDirection="column">
      {/* Progress */}
      <Box flexDirection="column" marginBottom={1}>
        <SectionHeader label="完成进度" />
        <Text color={theme.colors.success}>{progressBar.slice(0, barLen)}</Text>
        <Text color={theme.colors.muted}>{pct}%  {done}/{total} 完成</Text>
      </Box>

      {/* Status breakdown */}
      <Box flexDirection="column" marginBottom={1}>
        <SectionHeader label="状态分布" />
        <StatusRow icon="▶" label="进行中" count={inProg} color={theme.colors.warning} />
        <StatusRow icon="○" label="待办"   count={pending} color={theme.colors.text} />
        <StatusRow icon="✓" label="完成"   count={done}   color={theme.colors.success} />
      </Box>

      {/* Priority breakdown */}
      <Box flexDirection="column" marginBottom={1}>
        <SectionHeader label="优先级" />
        <StatusRow icon="!" label="紧急" count={high}   color={theme.colors.error} />
        <StatusRow icon="·" label="普通" count={normal} color={theme.colors.muted} />
      </Box>

      {/* High priority pending */}
      {high > 0 && (
        <Box flexDirection="column">
          <SectionHeader label="紧急待办" />
          {tasks
            .filter(t => t.priority === 'high' && t.status !== 'done')
            .slice(0, 4)
            .map(t => (
              <Box key={t.id}>
                <Text color={theme.colors.error}>! </Text>
                <Text color={theme.colors.text} wrap="truncate-end">
                  {t.title.slice(0, _width - 3)}
                </Text>
              </Box>
            ))}
        </Box>
      )}
    </Box>
  );
}

// ── Notes mode sidebar ────────────────────────────────────────────────────────

function NotesSideContent({ notes, width: _width, height: _height }: {
  notes: Note[];
  width: number;
  height: number;
}) {
  const pinned = notes.filter(n => n.pinned);
  const tagMap: Record<string, number> = {};
  for (const n of notes) {
    for (const t of n.tags) {
      tagMap[t] = (tagMap[t] ?? 0) + 1;
    }
  }
  const topTags = Object.entries(tagMap).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <Box flexDirection="column">
      {/* Stats */}
      <Box marginBottom={1}>
        <StatChip label="总笔记" value={notes.length} color={theme.colors.info} />
        <Text color={theme.colors.border}> · </Text>
        <StatChip label="置顶" value={pinned.length} color={theme.colors.accent} />
      </Box>

      {/* Pinned notes */}
      {pinned.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <SectionHeader label="📌 置顶" />
          {pinned.slice(0, 3).map(n => (
            <Text key={n.id} color={theme.colors.accent} wrap="truncate-end">
              {n.title.slice(0, _width - 2)}
            </Text>
          ))}
        </Box>
      )}

      {/* Tag cloud */}
      {topTags.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <SectionHeader label="标签" />
          <Box flexWrap="wrap">
            {topTags.map(([tag, cnt]) => (
              <Box key={tag} marginRight={1}>
                <Text color={theme.colors.primary}>#{tag}</Text>
                <Text color={theme.colors.muted}>({cnt}) </Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* All notes list */}
      <Box flexDirection="column">
        <SectionHeader label={`全部 (${notes.length})`} />
        {notes.slice(0, Math.max(3, _height - 14)).map(n => (
          <Box key={n.id}>
            <Text color={n.pinned ? theme.colors.accent : theme.colors.muted}>
              {n.pinned ? '◆' : '·'} {n.title.slice(0, _width - 3)}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ── Agents mode sidebar ───────────────────────────────────────────────────────

function AgentsSideContent({ agentTasks, width: _width, height: _height }: {
  agentTasks: AutonomousTask[];
  width: number;
  height: number;
}) {
  const running = agentTasks.filter(t => t.status === 'running');
  const done = agentTasks.filter(t => t.status === 'done');
  const failed = agentTasks.filter(t => t.status === 'failed');

  return (
    <Box flexDirection="column">
      {/* Summary */}
      <Box marginBottom={1}>
        <StatChip label="运行" value={running.length} color={theme.colors.success} />
        <Text color={theme.colors.border}> · </Text>
        <StatChip label="完成" value={done.length} color={theme.colors.muted} />
        <Text color={theme.colors.border}> · </Text>
        <StatChip label="失败" value={failed.length} color={theme.colors.error} />
      </Box>

      {/* Running tasks */}
      {running.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <SectionHeader label="运行中" />
          {running.slice(0, 4).map(t => (
            <Box key={t.id} flexDirection="column">
              <Box>
                <Text color={theme.colors.success}>▶ </Text>
                <Text color={theme.colors.text} wrap="truncate-end">
                  {t.goal.slice(0, _width - 3)}
                </Text>
              </Box>
              {t.currentStep && (
                <Text color={theme.colors.muted} dimColor>
                  {'  '}{t.currentStep.slice(0, _width - 3)}
                </Text>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* Recent done */}
      {done.length > 0 && (
        <Box flexDirection="column">
          <SectionHeader label="最近完成" />
          {done.slice(0, 3).map(t => (
            <Box key={t.id}>
              <Text color={theme.colors.success}>✓ </Text>
              <Text color={theme.colors.muted} wrap="truncate-end">
                {t.goal.slice(0, _width - 3)}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {agentTasks.length === 0 && (
        <Text color={theme.colors.muted} dimColor>
          按 Enter 运行 Agent{'\n'}
          输入自定义目标按 i
        </Text>
      )}
    </Box>
  );
}

// ── Plugins mode sidebar ──────────────────────────────────────────────────────

function PluginsSideContent({ plugins, width: _width, height: _height }: {
  plugins: LoadedPlugin[];
  width: number;
  height: number;
}) {
  const enabled = plugins.filter(p => p.enabled);
  const disabled = plugins.filter(p => !p.enabled);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <StatChip label="启用" value={enabled.length} color={theme.colors.success} />
        <Text color={theme.colors.border}> · </Text>
        <StatChip label="禁用" value={disabled.length} color={theme.colors.muted} />
      </Box>

      {enabled.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <SectionHeader label="已启用" />
          {enabled.map(p => (
            <Box key={p.def.id}>
              <Text color={theme.colors.success}>● </Text>
              <Text color={theme.colors.text} wrap="truncate-end">
                {p.def.name.slice(0, _width - 3)}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {disabled.length > 0 && (
        <Box flexDirection="column">
          <SectionHeader label="已禁用" />
          {disabled.map(p => (
            <Box key={p.def.id}>
              <Text color={theme.colors.border}>○ </Text>
              <Text color={theme.colors.muted} wrap="truncate-end">
                {p.def.name.slice(0, _width - 3)}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ── Helper sub-components ─────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <Box marginBottom={0}>
      <Text color={theme.colors.accent} bold dimColor>{label}</Text>
    </Box>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Box>
      <Text color={color} bold>{value}</Text>
      <Text color={theme.colors.muted}> {label}</Text>
    </Box>
  );
}

function StatusRow({ icon, label, count, color }: {
  icon: string;
  label: string;
  count: number;
  color: string;
}) {
  return (
    <Box>
      <Text color={color}>{icon} </Text>
      <Box width={6} flexShrink={0}>
        <Text color={theme.colors.muted}>{label}</Text>
      </Box>
      <Text color={color} bold>{count}</Text>
    </Box>
  );
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function modeIcon(mode: AppMode): string {
  switch (mode) {
    case 'chat':    return '◆';
    case 'tasks':   return '✓';
    case 'notes':   return '✎';
    case 'agents':  return '⬡';
    case 'plugins': return '⚙';
  }
}

function modeLabel(mode: AppMode): string {
  switch (mode) {
    case 'chat':    return 'CHAT';
    case 'tasks':   return 'TASKS';
    case 'notes':   return 'NOTES';
    case 'agents':  return 'AGENTS';
    case 'plugins': return 'PLUGINS';
  }
}

function priorityColor(priority: Task['priority']): string {
  switch (priority) {
    case 'high':   return theme.colors.error;
    case 'normal': return theme.colors.muted;
    case 'low':    return theme.colors.border;
  }
}
