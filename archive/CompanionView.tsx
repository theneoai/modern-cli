/**
 * CompanionView.tsx — AI 伴侣看板
 *
 * 三栏布局:
 *   左: 情感状态面板 (心情 / 熟悉度 / 好感度 / 能量)
 *   中: 对话区 (伴侣聊天记录 + 当前输入)
 *   右: 关系面板 (里程碑 / 惊喜记录 / 个性配置)
 *
 * 快捷键 (聚焦时):
 *   j/k       聊天历史滚动
 *   c         配置伴侣 (名字/性格)
 *   ESC       返回输入栏
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme } from '../../theme/index.js';
import { companionMemory } from '../companion/CompanionMemory.js';
import type { CompanionMessage } from '../companion/Companion.js';
import type { EmotionalState, Milestone, CompanionPersona } from '../companion/CompanionMemory.js';

// ── Props ─────────────────────────────────────────────────────────────────────

interface CompanionViewProps {
  messages: CompanionMessage[];
  height: number;
  width: number;
  isFocused: boolean;
  isThinking: boolean;
  onSendMessage: (text: string) => void;
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CompanionView({
  messages, height, width, isFocused, isThinking, onSendMessage,
}: CompanionViewProps) {
  const [, forceUpdate] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [showConfig, setShowConfig] = useState(false);
  const [configField, setConfigField] = useState<'name' | 'title' | 'personality' | null>(null);
  const [configInput, setConfigInput] = useState('');

  // Refresh emotional state every 5s
  useEffect(() => {
    const t = setInterval(() => forceUpdate(n => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  // Auto-scroll to bottom on new messages
  const prevMsgCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      setScrollOffset(0);
      prevMsgCount.current = messages.length;
    }
  }, [messages.length]);

  const data = companionMemory.get();
  const emotional = data.emotional;
  const persona = data.persona;

  // Layout
  const leftW = Math.floor(width * 0.22);
  const rightW = Math.floor(width * 0.25);
  const midW = width - leftW - rightW - 2;
  const chatH = height - 2;

  useInput((ch, key) => {
    if (!isFocused) return;

    if (showConfig && configField) {
      if (key.escape) { setConfigField(null); setConfigInput(''); return; }
      if (key.return) {
        const val = configInput.trim();
        if (val) {
          if (configField === 'name') companionMemory.updatePersona({ name: val, customized: true });
          if (configField === 'title') companionMemory.updatePersona({ masterTitle: val });
          if (configField === 'personality') {
            const p = val.toLowerCase();
            if (p === 'warm' || p === 'playful' || p === 'cool' || p === 'caring') {
              companionMemory.updatePersona({ personality: p });
            }
          }
        }
        setConfigField(null);
        setConfigInput('');
        forceUpdate(n => n + 1);
        return;
      }
      if (key.backspace) { setConfigInput(p => p.slice(0, -1)); return; }
      if (ch && !key.ctrl && !key.meta) { setConfigInput(p => p + ch); return; }
      return;
    }

    if (ch === 'c') { setShowConfig(s => !s); return; }
    if (key.upArrow || ch === 'k') { setScrollOffset(p => p + 1); return; }
    if (key.downArrow || ch === 'j') { setScrollOffset(p => Math.max(0, p - 1)); return; }
  });

  return (
    <Box flexDirection="row" width={width} height={height}>
      {/* Left: Emotional State */}
      <Box
        flexDirection="column"
        width={leftW}
        height={height}
        borderStyle="single"
        borderColor={theme.colors.accent}
      >
        <EmotionalPanel emotional={emotional} persona={persona} height={height} />
      </Box>

      {/* Center: Chat */}
      <Box
        flexDirection="column"
        width={midW}
        height={height}
        borderStyle="single"
        borderColor={isFocused ? theme.colors.primary : theme.colors.border}
        marginX={0}
      >
        {/* Header */}
        <Box height={1} paddingX={1}>
          <Text color={theme.colors.accent} bold>💝 {persona.name}</Text>
          <Text color={theme.colors.muted}> · {getMoodLabel(emotional.mood)}</Text>
          {isThinking && <Text color={theme.colors.warning}> ✦ 思考中...</Text>}
          <Box flexGrow={1} justifyContent="flex-end">
            <Text color={theme.colors.muted}>↑↓滚动  c:配置</Text>
          </Box>
        </Box>

        {/* Messages */}
        <Box flexDirection="column" flexGrow={1} overflow="hidden" paddingX={1}>
          <ChatMessages
            messages={messages}
            height={chatH - 1}
            width={midW - 4}
            scrollOffset={scrollOffset}
            persona={persona}
          />
        </Box>

        {/* Config overlay */}
        {showConfig && !configField && (
          <ConfigMenu
            persona={persona}
            onSelect={(f) => { setConfigField(f); setConfigInput(''); }}
            onClose={() => setShowConfig(false)}
          />
        )}
        {configField && (
          <ConfigInput
            field={configField}
            value={configInput}
            onClose={() => { setConfigField(null); setConfigInput(''); }}
          />
        )}
      </Box>

      {/* Right: Relationship Panel */}
      <Box
        flexDirection="column"
        width={rightW}
        height={height}
        borderStyle="single"
        borderColor={theme.colors.border}
      >
        <RelationshipPanel
          milestones={data.milestones}
          totalInteractions={data.totalInteractions}
          currentStreak={data.currentStreak}
          longestStreak={data.longestStreak}
          height={height}
          persona={persona}
          emotional={emotional}
        />
      </Box>
    </Box>
  );
}

// ── Emotional Panel ───────────────────────────────────────────────────────────

function EmotionalPanel({ emotional, persona, height }: {
  emotional: EmotionalState; persona: CompanionPersona; height: number;
}) {
  const moodEmoji = getMoodEmoji(emotional.mood);
  const energyColor = emotional.energy > 60 ? theme.colors.success : emotional.energy > 30 ? theme.colors.warning : theme.colors.error;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      {/* Name + mood */}
      <Box height={2} flexDirection="column" alignItems="center">
        <Text color={theme.colors.accent} bold>{moodEmoji}</Text>
        <Text color={theme.colors.muted}>{getMoodLabel(emotional.mood)}</Text>
      </Box>

      {/* Stats bars */}
      <Box flexDirection="column" marginTop={1}>
        <StatBar label="熟悉" value={emotional.familiarity} color={theme.colors.primary} />
        <StatBar label="好感" value={emotional.affection} color={theme.colors.accent} />
        <StatBar label="心情" value={(emotional.mood + 1) * 50} color={theme.colors.info} />
        <StatBar label="能量" value={emotional.energy} color={energyColor} />
      </Box>

      {/* Personality badge */}
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.muted}>性格</Text>
        <Text color={theme.colors.primary} bold>{getPersonalityLabel(persona.personality)}</Text>
      </Box>

      {/* Today's interactions */}
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.muted}>今日对话</Text>
        <Text color={theme.colors.text} bold>{emotional.todayInteractions} 次</Text>
      </Box>

      {/* Relationship level */}
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.muted}>关系阶段</Text>
        <Text color={theme.colors.accent} bold>{getRelationshipLevel(emotional.familiarity)}</Text>
      </Box>
    </Box>
  );
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  const barWidth = 10;
  const filled = Math.round((value / 100) * barWidth);
  const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
  return (
    <Box marginBottom={0}>
      <Box width={3} flexShrink={0}>
        <Text color={theme.colors.muted}>{label}</Text>
      </Box>
      <Text color={color}>{bar}</Text>
      <Text color={theme.colors.muted}> {Math.round(value)}</Text>
    </Box>
  );
}

// ── Chat Messages ─────────────────────────────────────────────────────────────

function ChatMessages({ messages, height, width, scrollOffset, persona }: {
  messages: CompanionMessage[];
  height: number;
  width: number;
  scrollOffset: number;
  persona: CompanionPersona;
}) {
  if (messages.length === 0) {
    return (
      <Box marginTop={2} flexDirection="column" alignItems="center">
        <Text color={theme.colors.muted}>还没有对话~</Text>
        <Text color={theme.colors.muted}>在下方输入框和 {persona.name} 聊天吧</Text>
      </Box>
    );
  }

  // Compute visible slice (latest messages, with scroll)
  const visibleCount = height - 1;
  const totalMsgs = messages.length;
  const endIdx = Math.max(0, totalMsgs - scrollOffset);
  const startIdx = Math.max(0, endIdx - visibleCount);
  const visible = messages.slice(startIdx, endIdx);

  return (
    <Box flexDirection="column">
      {scrollOffset > 0 && (
        <Text color={theme.colors.muted}>↑ {scrollOffset} 条更早消息</Text>
      )}
      {visible.map(msg => (
        <MessageBubble key={msg.id} msg={msg} width={width} persona={persona} />
      ))}
    </Box>
  );
}

function MessageBubble({ msg, width, persona }: {
  msg: CompanionMessage; width: number; persona: CompanionPersona;
}) {
  const isCompanion = msg.type !== 'system';
  const maxW = Math.floor(width * 0.85);
  const timeStr = formatTime(msg.at);

  if (msg.type === 'system') {
    return (
      <Box marginY={0}>
        <Text color={theme.colors.muted} dimColor>  {msg.content}</Text>
      </Box>
    );
  }

  if (msg.type === 'surprise') {
    return (
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={theme.colors.accent}
        paddingX={1}
        marginY={0}
        width={maxW}
      >
        <Text color={theme.colors.accent} bold>{msg.content}</Text>
        <Text color={theme.colors.muted}>{timeStr}</Text>
      </Box>
    );
  }

  if (msg.type === 'suggestion' || msg.type === 'reminder') {
    return (
      <Box marginY={0}>
        <Text color={theme.colors.info}>{msg.emotion ?? '💡'} </Text>
        <Text color={theme.colors.text}>{msg.content}</Text>
        <Text color={theme.colors.muted}> {timeStr}</Text>
      </Box>
    );
  }

  // Regular chat
  return (
    <Box flexDirection="column" marginBottom={0}>
      <Box>
        <Text color={theme.colors.accent} bold>{msg.emotion ?? '💝'} {persona.name}</Text>
        <Text color={theme.colors.muted}> {timeStr}</Text>
      </Box>
      <Box paddingLeft={2} width={maxW}>
        <Text color={theme.colors.text} wrap="wrap">{msg.content}</Text>
      </Box>
    </Box>
  );
}

// ── Relationship Panel ────────────────────────────────────────────────────────

function RelationshipPanel({ milestones, totalInteractions, currentStreak, longestStreak, height, persona, emotional }: {
  milestones: Milestone[];
  totalInteractions: number;
  currentStreak: number;
  longestStreak: number;
  height: number;
  persona: CompanionPersona;
  emotional: EmotionalState;
}) {
  const visibleMilestones = milestones.slice(0, Math.max(3, height - 12));
  const createdAt = companionMemory.get().createdAt;
  const daysTogether = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={theme.colors.primary} bold>关系数据</Text>

      {/* Stats */}
      <Box flexDirection="column" marginTop={1}>
        <StatRow label="相处天数" value={`${daysTogether} 天`} />
        <StatRow label="总对话数" value={`${totalInteractions} 次`} />
        <StatRow label="连续打卡" value={`${currentStreak} 天`} />
        <StatRow label="最长连续" value={`${longestStreak} 天`} />
        <StatRow label="称呼主人" value={persona.masterTitle} />
      </Box>

      {/* Relationship progress */}
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.colors.muted}>下一阶段</Text>
        <NextLevelBar familiarity={emotional.familiarity} />
      </Box>

      {/* Milestones */}
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.colors.accent} bold>成就</Text>
        {milestones.length === 0 ? (
          <Text color={theme.colors.muted}>暂无 — 多聊聊吧~</Text>
        ) : (
          visibleMilestones.map(m => (
            <Box key={m.id}>
              <Text color={theme.colors.accent}>{m.emoji} </Text>
              <Text color={theme.colors.text}>{m.title}</Text>
            </Box>
          ))
        )}
        {milestones.length > visibleMilestones.length && (
          <Text color={theme.colors.muted}>+{milestones.length - visibleMilestones.length} 更多</Text>
        )}
      </Box>

      {/* Quick actions hint */}
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.colors.muted}>c: 配置 | /mate 聊天</Text>
      </Box>
    </Box>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Box width={8} flexShrink={0}>
        <Text color={theme.colors.muted}>{label}</Text>
      </Box>
      <Text color={theme.colors.text} bold>{value}</Text>
    </Box>
  );
}

function NextLevelBar({ familiarity }: { familiarity: number }) {
  const levels = [10, 25, 50, 75, 95];
  const next = levels.find(l => l > familiarity) ?? 100;
  const prev = levels.slice().reverse().find(l => l <= familiarity) ?? 0;
  const pct = prev >= next ? 100 : Math.round(((familiarity - prev) / (next - prev)) * 100);
  const barW = 12;
  const filled = Math.round((pct / 100) * barW);
  const bar = '▰'.repeat(filled) + '▱'.repeat(barW - filled);
  const label = familiarity >= 95 ? '已满级' : `→${getRelationshipLevel(next)}`;
  return (
    <Box>
      <Text color={theme.colors.primary}>{bar}</Text>
      <Text color={theme.colors.muted}> {pct}% {label}</Text>
    </Box>
  );
}

// ── Config ────────────────────────────────────────────────────────────────────

function ConfigMenu({ persona, onSelect, onClose }: {
  persona: CompanionPersona;
  onSelect: (f: 'name' | 'title' | 'personality') => void;
  onClose: () => void;
}) {
  return (
    <Box
      position="absolute"
      marginTop={2}
      marginLeft={2}
      flexDirection="column"
      borderStyle="single"
      borderColor={theme.colors.primary}
      paddingX={2}
      paddingY={0}
      backgroundColor={theme.colors.surface}
    >
      <Text color={theme.colors.primary} bold>配置伴侣</Text>
      <Text color={theme.colors.muted}>当前: {persona.name} · {persona.masterTitle} · {getPersonalityLabel(persona.personality)}</Text>
      <Box flexDirection="column" marginTop={0}>
        <Text color={theme.colors.text}>[1] 修改名字 (当前: {persona.name})</Text>
        <Text color={theme.colors.text}>[2] 修改主人称呼 (当前: {persona.masterTitle})</Text>
        <Text color={theme.colors.text}>[3] 修改性格 warm/playful/cool/caring</Text>
        <Text color={theme.colors.muted}>ESC 关闭</Text>
      </Box>
    </Box>
  );
}

function ConfigInput({ field, value, onClose }: {
  field: 'name' | 'title' | 'personality';
  value: string;
  onClose: () => void;
}) {
  const labels: Record<string, string> = {
    name: '新名字', title: '称呼主人', personality: '性格(warm/playful/cool/caring)',
  };
  return (
    <Box
      borderStyle="single"
      borderColor={theme.colors.primary}
      paddingX={1}
      marginX={1}
      alignItems="center"
    >
      <Text color={theme.colors.muted}>{labels[field]}: </Text>
      <Text color={theme.colors.text}>{value}</Text>
      <Text color={theme.colors.background} backgroundColor={theme.colors.primary}> </Text>
      <Text color={theme.colors.muted}> Enter:确认 ESC:取消</Text>
    </Box>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMoodEmoji(mood: number): string {
  if (mood > 0.6) return '😊';
  if (mood > 0.3) return '🙂';
  if (mood > -0.1) return '😐';
  if (mood > -0.5) return '😔';
  return '💙';
}

function getMoodLabel(mood: number): string {
  if (mood > 0.6) return '开心';
  if (mood > 0.2) return '平静';
  if (mood > -0.2) return '普通';
  if (mood > -0.6) return '有点低落';
  return '需要关怀';
}

function getPersonalityLabel(p: string): string {
  switch (p) {
    case 'warm': return '温柔';
    case 'playful': return '俏皮';
    case 'cool': return '冷静';
    case 'caring': return '贴心';
    default: return p;
  }
}

function getRelationshipLevel(familiarity: number): string {
  if (familiarity >= 95) return '心灵相通';
  if (familiarity >= 75) return '心有灵犀';
  if (familiarity >= 50) return '默契';
  if (familiarity >= 25) return '相熟';
  if (familiarity >= 10) return '初识';
  return '陌生';
}

function formatTime(d: Date): string {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}
