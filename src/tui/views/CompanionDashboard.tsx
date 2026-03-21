/**
 * CompanionDashboard.tsx — 助理关系看板 (覆盖层)
 *
 * 布局: 双栏弹窗, 类似 HelpOverlay
 *   左栏: 情感状态 + 关系进度
 *   右栏: 成就里程碑 + 配置
 *
 * 快捷键:
 *   j/k / ↑↓   导航配置选项
 *   c           进入配置模式
 *   Enter       从这里直接发消息给 Neo
 *   ESC         关闭
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme } from '../../theme/index.js';
import { companionMemory } from '../companion/CompanionMemory.js';
import { voiceEngine, EDGE_VOICES } from '../companion/voice/VoiceEngine.js';
import { intelEngine } from '../intel/IntelEngine.js';

// ── Props ─────────────────────────────────────────────────────────────────────

interface CompanionDashboardProps {
  width: number;
  height: number;
  onClose: () => void;
  onChat: (text: string) => Promise<void>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CompanionDashboard({ width, height, onClose, onChat }: CompanionDashboardProps) {
  const [tab, setTab] = useState<'stats' | 'config' | 'intel' | 'voice'>('stats');
  const [chatInput, setChatInput] = useState('');
  const [configField, setConfigField] = useState<'name' | 'title' | 'personality' | null>(null);
  const [configInput, setConfigInput] = useState('');
  const [, forceUpdate] = useState(0);

  const data = companionMemory.get();
  const e = data.emotional;
  const p = data.persona;

  useInput((ch, key) => {
    if (key.escape) {
      if (configField) { setConfigField(null); setConfigInput(''); return; }
      onClose();
      return;
    }

    // Config field input
    if (configField) {
      if (key.return) {
        const val = configInput.trim();
        if (val) {
          if (configField === 'name') companionMemory.updatePersona({ name: val, customized: true });
          if (configField === 'title') companionMemory.updatePersona({ masterTitle: val });
          if (configField === 'personality') {
            const pv = val.toLowerCase();
            if (pv === 'warm' || pv === 'playful' || pv === 'cool' || pv === 'caring') {
              companionMemory.updatePersona({ personality: pv });
            }
          }
        }
        setConfigField(null);
        setConfigInput('');
        forceUpdate(n => n + 1);
        return;
      }
      if (key.backspace) { setConfigInput(s => s.slice(0, -1)); return; }
      if (ch && !key.ctrl && !key.meta) { setConfigInput(s => s + ch); return; }
      return;
    }

    // Chat input mode
    if (chatInput.length > 0 || ch === '@') {
      if (key.return && chatInput.trim()) {
        const text = chatInput.trim();
        setChatInput('');
        void onChat(text);
        return;
      }
      if (key.backspace) { setChatInput(s => s.slice(0, -1)); return; }
      if (ch && !key.ctrl && !key.meta && !key.escape) { setChatInput(s => s + ch); return; }
      return;
    }

    // Tab switching
    if (ch === 's') { setTab('stats');  return; }
    if (ch === 'c') { setTab('config'); return; }
    if (ch === 'i') { setTab('intel');  return; }
    if (ch === 'v') { setTab('voice');  return; }

    // Config shortcuts in config tab
    if (tab === 'config') {
      if (ch === '1') { setConfigField('name'); setConfigInput(''); return; }
      if (ch === '2') { setConfigField('title'); setConfigInput(''); return; }
      if (ch === '3') { setConfigField('personality'); setConfigInput(''); return; }
    }

    // Start chatting
    if (ch && !key.ctrl && !key.meta) {
      setChatInput(ch);
      return;
    }
  });

  const leftW = Math.floor((width - 3) * 0.5);
  const rightW = width - leftW - 3;
  const innerH = height - 4; // minus border + header + chat bar

  const moodEmoji = e.mood > 0.5 ? '😊' : e.mood > 0.1 ? '🙂' : e.mood > -0.2 ? '😐' : '😔';
  const relLevel = getRelLevel(e.familiarity);

  return (
    <Box
      position="absolute"
      marginTop={1}
      marginLeft={2}
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="double"
      borderColor={theme.colors.accent}
    >
      {/* Header */}
      <Box height={1} paddingX={1} justifyContent="space-between">
        <Box>
          <Text color={theme.colors.accent} bold>💝 {p.name}</Text>
          <Text color={theme.colors.muted}> · {relLevel} · {moodEmoji}  </Text>
          {(['stats','config','intel','voice'] as const).map((t, i) => (
            <React.Fragment key={t}>
              <Text color={tab === t ? theme.colors.accent : theme.colors.muted} bold={tab === t}>
                {['s:状态','c:配置','i:情报','v:语音'][i]}
              </Text>
              <Text color={theme.colors.muted}>{i < 3 ? '  ' : ''}</Text>
            </React.Fragment>
          ))}
        </Box>
        <Text color={theme.colors.muted}>ESC:关闭</Text>
      </Box>

      {/* Body */}
      <Box flexDirection="row" flexGrow={1} overflow="hidden">
        {/* Left column */}
        <Box flexDirection="column" width={leftW} paddingX={1} overflow="hidden">
          {tab === 'stats' ? (
            <StatsPanel data={data} innerH={innerH} />
          ) : tab === 'config' ? (
            <ConfigPanel
              persona={p}
              configField={configField}
              configInput={configInput}
              innerH={innerH}
            />
          ) : tab === 'intel' ? (
            <IntelPanel innerH={innerH} />
          ) : (
            <VoicePanel innerH={innerH} forceUpdate={forceUpdate} />
          )}
        </Box>

        {/* Divider */}
        <Box flexDirection="column" width={1}>
          {Array.from({ length: innerH + 1 }).map((_, i) => (
            <Text key={i} color={theme.colors.border}>│</Text>
          ))}
        </Box>

        {/* Right column */}
        <Box flexDirection="column" width={rightW} paddingX={1} overflow="hidden">
          {tab === 'intel' ? (
            <IntelDetailPanel innerH={innerH} />
          ) : (
            <MilestonesPanel data={data} innerH={innerH} />
          )}
        </Box>
      </Box>

      {/* Chat bar */}
      <Box
        height={1}
        borderStyle="single"
        borderColor={chatInput ? theme.colors.accent : theme.colors.border}
        paddingX={1}
        alignItems="center"
        marginTop={0}
      >
        <Text color={theme.colors.accent} bold>💝 </Text>
        {chatInput ? (
          <Box flexGrow={1}>
            <Text color={theme.colors.text}>{chatInput}</Text>
            <Text color={theme.colors.background} backgroundColor={theme.colors.accent}> </Text>
            <Text color={theme.colors.muted}> ↵发送</Text>
          </Box>
        ) : (
          <Text color={theme.colors.muted}>直接输入发消息给 {p.name} · ↵发送</Text>
        )}
      </Box>
    </Box>
  );
}

// ── Stats Panel ───────────────────────────────────────────────────────────────

function StatsPanel({ data, innerH }: { data: ReturnType<typeof companionMemory.get>; innerH: number }) {
  const e = data.emotional;
  const createdAt = data.createdAt;
  const daysTogether = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);

  return (
    <Box flexDirection="column">
      {/* Emotional bars */}
      <Text color={theme.colors.primary} bold>情感状态</Text>
      <EmoBar label="熟悉" val={e.familiarity} color={theme.colors.primary} />
      <EmoBar label="好感" val={e.affection}   color={theme.colors.accent}  />
      <EmoBar label="心情" val={(e.mood + 1) * 50} color={theme.colors.info} />
      <EmoBar label="能量" val={e.energy}      color={theme.colors.success} />

      {/* Relationship stats */}
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.primary} bold>关系数据</Text>
        <Row label="相处天数" value={`${daysTogether} 天`} />
        <Row label="总对话"   value={`${data.totalInteractions} 次`} />
        <Row label="连续打卡" value={`${data.currentStreak} 天`} />
        <Row label="最长连续" value={`${data.longestStreak} 天`} />
        <Row label="今日对话" value={`${e.todayInteractions} 次`} />
      </Box>

      {/* Next level */}
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.muted}>下一阶段</Text>
        <NextLevel familiarity={e.familiarity} />
      </Box>
    </Box>
  );
}

function EmoBar({ label, val, color }: { label: string; val: number; color: string }) {
  const w = 14;
  const filled = Math.round((Math.min(100, Math.max(0, val)) / 100) * w);
  const bar = '█'.repeat(filled) + '░'.repeat(w - filled);
  return (
    <Box>
      <Box width={4} flexShrink={0}><Text color={theme.colors.muted}>{label}</Text></Box>
      <Text color={color}>{bar}</Text>
      <Text color={theme.colors.muted}> {Math.round(val)}</Text>
    </Box>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Box width={9} flexShrink={0}><Text color={theme.colors.muted}>{label}</Text></Box>
      <Text color={theme.colors.text} bold>{value}</Text>
    </Box>
  );
}

function NextLevel({ familiarity }: { familiarity: number }) {
  const levels = [10, 25, 50, 75, 95, 100];
  const next = levels.find(l => l > familiarity) ?? 100;
  const prev = [0, 10, 25, 50, 75, 95].slice().reverse().find(l => l <= familiarity) ?? 0;
  const pct = prev >= next ? 100 : Math.round(((familiarity - prev) / (next - prev)) * 100);
  const bw = 14;
  const filled = Math.round((pct / 100) * bw);
  const bar = '▰'.repeat(filled) + '▱'.repeat(bw - filled);
  return (
    <Box>
      <Text color={theme.colors.primary}>{bar}</Text>
      <Text color={theme.colors.muted}> {pct}% → {getRelLevel(next)}</Text>
    </Box>
  );
}

// ── Config Panel ──────────────────────────────────────────────────────────────

function ConfigPanel({
  persona, configField, configInput, innerH,
}: {
  persona: { name: string; masterTitle: string; personality: string; customized: boolean };
  configField: string | null;
  configInput: string;
  innerH: number;
}) {
  return (
    <Box flexDirection="column">
      <Text color={theme.colors.primary} bold>伴侣配置</Text>

      <Box marginTop={1} flexDirection="column">
        <Row label="名字" value={persona.name + (persona.customized ? '' : ' (默认)')} />
        <Row label="称呼" value={persona.masterTitle} />
        <Row label="性格" value={getPersonLabel(persona.personality)} />
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.muted}>按数字修改:</Text>
        <Text color={theme.colors.text}>[1] 名字 (当前: {persona.name})</Text>
        <Text color={theme.colors.text}>[2] 称呼主人 (当前: {persona.masterTitle})</Text>
        <Text color={theme.colors.text}>[3] 性格</Text>
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.colors.muted}>性格选项:</Text>
          <Text color={persona.personality === 'warm'    ? theme.colors.accent : theme.colors.muted}>  warm    温柔体贴{persona.personality === 'warm' ? ' ◀' : ''}</Text>
          <Text color={persona.personality === 'playful' ? theme.colors.accent : theme.colors.muted}>  playful 俏皮幽默{persona.personality === 'playful' ? ' ◀' : ''}</Text>
          <Text color={persona.personality === 'cool'    ? theme.colors.accent : theme.colors.muted}>  cool    冷静克制{persona.personality === 'cool' ? ' ◀' : ''}</Text>
          <Text color={persona.personality === 'caring'  ? theme.colors.accent : theme.colors.muted}>  caring  细心关怀{persona.personality === 'caring' ? ' ◀' : ''}</Text>
        </Box>
      </Box>

      {configField && (
        <Box
          marginTop={1}
          borderStyle="single"
          borderColor={theme.colors.accent}
          paddingX={1}
          alignItems="center"
        >
          <Text color={theme.colors.muted}>
            {configField === 'name' ? '新名字' : configField === 'title' ? '称呼主人' : '性格'}: </Text>
          <Text color={theme.colors.text}>{configInput}</Text>
          <Text color={theme.colors.background} backgroundColor={theme.colors.accent}> </Text>
          <Text color={theme.colors.muted}> ↵确认</Text>
        </Box>
      )}
    </Box>
  );
}

// ── Milestones Panel ──────────────────────────────────────────────────────────

function MilestonesPanel({ data, innerH }: {
  data: ReturnType<typeof companionMemory.get>;
  innerH: number;
}) {
  const maxMs = Math.max(3, innerH - 6);
  const visible = data.milestones.slice(0, maxMs);

  return (
    <Box flexDirection="column">
      <Text color={theme.colors.primary} bold>成就</Text>

      {visible.length === 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.colors.muted}>暂无成就</Text>
          <Text color={theme.colors.muted}>多和 Neo 聊聊吧~</Text>
        </Box>
      ) : (
        visible.map(m => (
          <Box key={m.id} marginTop={0}>
            <Text color={theme.colors.accent}>{m.emoji} </Text>
            <Box flexDirection="column">
              <Text color={theme.colors.text} bold>{m.title}</Text>
              <Text color={theme.colors.muted}>{m.desc}</Text>
            </Box>
          </Box>
        ))
      )}

      {data.milestones.length > maxMs && (
        <Text color={theme.colors.muted}>+{data.milestones.length - maxMs} 更多...</Text>
      )}

      {/* Recent surprises */}
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.primary} bold>最近惊喜</Text>
        {data.surprises.slice(0, 3).map(s => (
          <Box key={s.id}>
            <Text color={theme.colors.accent}>✨ </Text>
            <Text color={theme.colors.muted}>{getSurpriseLabel(s.type)} · {fmtDate(s.at)}</Text>
          </Box>
        ))}
        {data.surprises.length === 0 && (
          <Text color={theme.colors.muted}>还没有惊喜 — 期待中~</Text>
        )}
      </Box>
    </Box>
  );
}

// ── Intel Panel (left col, tab=intel) ─────────────────────────────────────────

function IntelPanel({ innerH }: { innerH: number }) {
  const stats = intelEngine.getStats();
  const collectors = intelEngine.collectorStatus();
  return (
    <Box flexDirection="column">
      <Text color={theme.colors.primary} bold>情报中心</Text>
      <Box marginTop={1} flexDirection="column">
        <Row label="总条数" value={`${stats.total}`} />
        <Row label="未读"   value={`${stats.unread}`} />
        <Row label="HN"     value={`${stats.bySource['hackernews'] ?? 0}`} />
        <Row label="GitHub" value={`${stats.bySource['github'] ?? 0}`} />
        <Row label="RSS"    value={`${stats.bySource['rss'] ?? 0}`} />
        <Row label="搜索"   value={`${stats.bySource['search'] ?? 0}`} />
        <Row label="天气"   value={`${stats.bySource['weather'] ?? 0}`} />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.muted}>采集器状态:</Text>
        {collectors.filter(c => c.enabled || c.running).slice(0, Math.max(3, innerH - 12)).map(c => (
          <Box key={c.id}>
            <Text color={c.running ? theme.colors.success : theme.colors.muted}>
              {c.running ? '● ' : '○ '}
            </Text>
            <Text color={theme.colors.text}>{c.name}</Text>
            {c.interval > 0 && (
              <Text color={theme.colors.muted}> {Math.round(c.interval / 60000)}m</Text>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function IntelDetailPanel({ innerH }: { innerH: number }) {
  const items = intelEngine.getRecent(Math.max(5, innerH - 2));
  return (
    <Box flexDirection="column">
      <Text color={theme.colors.primary} bold>最新情报</Text>
      {items.length === 0 ? (
        <Text color={theme.colors.muted}>正在采集中...</Text>
      ) : (
        items.map(item => (
          <Box key={item.id} marginTop={0} flexDirection="column">
            <Box>
              <Text color={item.read ? theme.colors.muted : theme.colors.accent}>
                {item.read ? '· ' : '● '}
              </Text>
              <Text color={item.read ? theme.colors.muted : theme.colors.text} wrap="truncate">
                {item.title.slice(0, 38)}
              </Text>
            </Box>
          </Box>
        ))
      )}
    </Box>
  );
}

// ── Voice Panel (left col, tab=voice) ─────────────────────────────────────────

function VoicePanel({ innerH, forceUpdate }: { innerH: number; forceUpdate: (fn: (n: number) => number) => void }) {
  const cfg = voiceEngine.config;
  const voices = Object.entries(EDGE_VOICES) as [keyof typeof EDGE_VOICES, string][];

  return (
    <Box flexDirection="column">
      <Text color={theme.colors.primary} bold>语音设置</Text>

      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text color={theme.colors.muted}>状态: </Text>
          <Text color={cfg.enabled ? theme.colors.success : theme.colors.muted} bold>
            {cfg.enabled ? '● 已开启' : '○ 已关闭'}
          </Text>
          <Text color={theme.colors.muted}> (Ctrl+V 切换)</Text>
        </Box>
        <Row label="引擎" value={voiceEngine.providerLabel()} />
        <Row label="自动播报" value={cfg.autoSpeak ? '是' : '否'} />
        <Row label="语速" value={cfg.rate} />
        <Row label="音调" value={cfg.pitch} />
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.muted}>音色列表 (/voice &lt;名称&gt; 切换):</Text>
        {voices.slice(0, Math.max(4, innerH - 10)).map(([id, label]) => (
          <Box key={id}>
            <Text color={cfg.voice === id ? theme.colors.accent : theme.colors.muted}>
              {cfg.voice === id ? '▶ ' : '  '}
            </Text>
            <Text color={cfg.voice === id ? theme.colors.text : theme.colors.muted}>
              {label}
            </Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.muted}>安装 edge-tts 获得最佳音质:</Text>
        <Text color={theme.colors.info}>pip install edge-tts</Text>
      </Box>
    </Box>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRelLevel(f: number): string {
  if (f >= 95) return '心灵相通';
  if (f >= 75) return '心有灵犀';
  if (f >= 50) return '默契';
  if (f >= 25) return '相熟';
  if (f >= 10) return '初识';
  return '陌生';
}

function getPersonLabel(p: string): string {
  switch (p) {
    case 'warm': return '温柔';
    case 'playful': return '俏皮';
    case 'cool': return '冷静';
    case 'caring': return '贴心';
    default: return p;
  }
}

function getSurpriseLabel(type: string): string {
  switch (type) {
    case 'poem': return '诗';
    case 'joke': return '笑话';
    case 'compliment': return '夸夸';
    case 'memory': return '回忆';
    case 'wish': return '心愿';
    default: return '惊喜';
  }
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${m}-${day}`;
}
