/**
 * HelpOverlay.tsx - 完整快捷键参考 + 场景流程
 * 按 ? 或 /help 显示
 */

import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme } from '../../theme/index.js';

type HelpTab = 'keys' | 'workflows' | 'commands';

interface HelpOverlayProps {
  width: number;
  height: number;
  onClose: () => void;
}

export function HelpOverlay({ width, height, onClose }: HelpOverlayProps) {
  const [tab, setTab] = useState<HelpTab>('keys');

  useInput((ch, key) => {
    if (key.escape || ch === 'q' || ch === '?') { onClose(); return; }
    if (ch === '1') setTab('keys');
    if (ch === '2') setTab('workflows');
    if (ch === '3') setTab('commands');
    if (key.leftArrow) {
      setTab(prev => prev === 'keys' ? 'commands' : prev === 'workflows' ? 'keys' : 'workflows');
    }
    if (key.rightArrow) {
      setTab(prev => prev === 'keys' ? 'workflows' : prev === 'workflows' ? 'commands' : 'keys');
    }
  });

  const contentHeight = height - 4;

  return (
    <Box
      position="absolute"
      marginLeft={1}
      marginTop={1}
      width={width}
      height={height}
      flexDirection="column"
      borderStyle="double"
      borderColor={theme.colors.primary}
      backgroundColor={theme.colors.surface}
    >
      {/* Title + tabs */}
      <Box height={1} paddingX={2} alignItems="center">
        <Text color={theme.colors.primary} bold>◆  NEO 使用指南</Text>
        <Box flexGrow={1} />
        <TabBtn label="1:快捷键" active={tab === 'keys'} />
        <Text color={theme.colors.muted}> </Text>
        <TabBtn label="2:场景流程" active={tab === 'workflows'} />
        <Text color={theme.colors.muted}> </Text>
        <TabBtn label="3:全部命令" active={tab === 'commands'} />
        <Text color={theme.colors.muted}> ←→切换 ESC关闭</Text>
      </Box>

      <Box flexGrow={1} overflow="hidden">
        {tab === 'keys'      && <KeysTab height={contentHeight} width={width} />}
        {tab === 'workflows' && <WorkflowsTab height={contentHeight} width={width} />}
        {tab === 'commands'  && <CommandsTab height={contentHeight} width={width} />}
      </Box>

      <Box height={1} paddingX={2}>
        <Text color={theme.colors.muted}>
          心流体验: 专注输入 → Tab 聚焦内容 → ESC 返回输入 → Ctrl+K 快速切换
        </Text>
      </Box>
    </Box>
  );
}

// ── Tab: Keyboard Shortcuts ──────────────────────────────────────────────────

function KeysTab({ height: _height, width }: { height: number; width: number }) {
  const col = Math.floor((width - 4) / 2);
  return (
    <Box flexDirection="row" padding={1}>
      <Box flexDirection="column" width={col} marginRight={1}>
        <Section title="◆ 全局" items={[
          ['Ctrl+K',       '命令面板 (所有命令模糊搜索)'],
          ['?',            '此帮助面板 (内容聚焦时)'],
          ['Tab',          '输入栏 ↔ 内容面板 切换'],
          ['ESC',          '返回输入栏 / 取消'],
          ['Ctrl+1',       '切换到 CHAT 对话'],
          ['Ctrl+2',       '切换到 TASKS 任务'],
          ['Ctrl+3',       '切换到 NOTES 笔记'],
          ['Ctrl+4',       '切换到 AGENTS'],
          ['Ctrl+N',       '新建对话'],
          ['Ctrl+L',       '清空当前视图'],
        ]} />
        <Section title="▤ 窗口布局" items={[
          ['Ctrl+B',       '显示 / 隐藏侧栏'],
          ['Alt+[',        '侧栏收窄 -2 列'],
          ['Alt+]',        '侧栏展宽 +2 列'],
          ['Alt+L',        '循环切换布局预设'],
          ['/layout',      '查看 / 应用布局预设'],
        ]} />
        <Section title="💬 对话 CHAT" items={[
          ['Enter',        '发送消息 / 触发 AI'],
          ['↑↓ 历史',      '浏览输入历史记录'],
          ['Tab → j/k',    '聚焦后上下滚动消息'],
          ['g / G',        '跳到消息顶 / 底'],
          ['Ctrl+U/D',     '半页上下滚动'],
          ['PgUp/PgDn',    '整页滚动'],
          ['Ctrl+U (输入)', '清空输入行'],
          ['Ctrl+W',       '删除上一个词'],
        ]} />
      </Box>
      <Box flexDirection="column" width={col}>
        <Section title="✓ 任务 TASKS" items={[
          ['j / k',        '上下移动光标'],
          ['Space / Enter', '切换完成状态'],
          ['s',            '循环状态 待→进行→完成'],
          ['d',            '删除选中任务'],
          ['/',            '搜索过滤任务'],
          ['v',            '显示/隐藏已完成'],
          ['gg / G',       '跳到顶 / 底'],
        ]} />
        <Section title="📝 笔记 NOTES" items={[
          ['j / k',        '导航笔记列表'],
          ['Enter / Space', '展开/收起笔记'],
          ['p',            '置顶笔记'],
          ['d',            '删除笔记'],
          ['/',            '搜索过滤笔记'],
        ]} />
        <Section title="⚙ AGENTS" items={[
          ['j / k',        '选择 Agent'],
          ['Enter / Space', '快速运行'],
          ['i',            '输入自定义目标运行'],
          ['ESC',          '取消目标输入'],
        ]} />
      </Box>
    </Box>
  );
}

// ── Tab: Workflow Analysis ───────────────────────────────────────────────────

function WorkflowsTab({ width }: { height: number; width: number }) {
  const col = Math.floor((width - 4) / 2);

  const workflows = [
    {
      title: '🌅 晨间规划',
      traditional: ['打开日历 App', '查看邮件 App', '打开 Todo App', '打开笔记整理计划'],
      cli: ['❯ /plan', '  → AI 读取任务列表生成时间块', '  → 直接建议优先级', '  → todo 重要会议'],
    },
    {
      title: '💼 项目跟进',
      traditional: ['Jira 看板更新', 'Slack 同步进度', 'GitHub PR 审查', 'Email 跟进'],
      cli: ['❯ todo 完成 PR #42 代码审查', '❯ /code 帮我实现用户认证', '❯ /debug 这个报错是什么意思', '❯ /review'],
    },
    {
      title: '📚 学习研究',
      traditional: ['Google 搜索', '多标签页浏览', '复制粘贴到笔记', '整理思维导图'],
      cli: ['❯ /research React 18 并发特性', '  → AI 深度分析梳理', '❯ note 并发渲染原理...', '❯ Ctrl+3 查看笔记'],
    },
    {
      title: '💻 开发编码',
      traditional: ['IDE 编码', 'Stack Overflow 搜索', 'Terminal 测试', 'Docs 文档查阅'],
      cli: ['❯ /explain async/await 原理', '❯ /code 实现 JWT 认证中间件', '❯ /debug Cannot read property...', '❯ /refactor [粘贴代码]'],
    },
    {
      title: '✍ 写作创作',
      traditional: ['打开文档工具', '查阅参考资料', '切换拼写检查', '手动格式调整'],
      cli: ['❯ /write 给团队写发布通知邮件', '❯ /translate 翻译为英文', '❯ /summary 总结上面这段', '❯ note 关键措辞备忘'],
    },
    {
      title: '🍅 专注计时',
      traditional: ['找计时器 App', '设置时间', '切回工作', '频繁看时间'],
      cli: ['❯ timer 25', '  → 标题栏 ⏱ 24:59 实时倒计时', '  → 到点自动提醒', '❯ timer 5  ← 休息'],
    },
  ];

  return (
    <Box flexDirection="column" padding={1} overflow="hidden">
      <Box flexDirection="row" flexWrap="wrap">
        {workflows.slice(0, 3).map(wf => (
          <WorkflowCard key={wf.title} wf={wf} width={col} />
        ))}
      </Box>
      <Box flexDirection="row" flexWrap="wrap">
        {workflows.slice(3).map(wf => (
          <WorkflowCard key={wf.title} wf={wf} width={col} />
        ))}
      </Box>
    </Box>
  );
}

function WorkflowCard({ wf, width }: {
  wf: { title: string; traditional: string[]; cli: string[] };
  width: number;
}) {
  const half = Math.floor(width / 2) - 2;
  return (
    <Box
      flexDirection="column"
      width={width}
      marginRight={1}
      marginBottom={1}
      borderStyle="single"
      borderColor={theme.colors.border}
      paddingX={1}
    >
      <Box>
        <Text color={theme.colors.accent} bold>{wf.title}  </Text>
        <Text color={theme.colors.muted}>传统步骤</Text>
        <Text color={theme.colors.muted}> → </Text>
        <Text color={theme.colors.success}>NEO</Text>
      </Box>
      <Box flexDirection="row">
        <Box flexDirection="column" width={half} marginRight={1}>
          {wf.traditional.slice(0, 3).map((s, i) => (
            <Text key={i} color={theme.colors.muted}>· {s}</Text>
          ))}
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          {wf.cli.slice(0, 3).map((s, i) => (
            <Text key={i} color={s.startsWith('❯') ? theme.colors.primary : theme.colors.text}>{s}</Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

// ── Tab: All Commands ────────────────────────────────────────────────────────

function CommandsTab({ width }: { height: number; width: number }) {
  const col = Math.floor((width - 4) / 2);
  return (
    <Box flexDirection="row" padding={1}>
      <Box flexDirection="column" width={col} marginRight={1}>
        <CmdSection title="视图切换" cmds={[
          ['/chat', '对话模式'],
          ['/tasks', '任务管理'],
          ['/notes', '笔记视图'],
          ['/agents', 'AI Agent'],
        ]} />
        <CmdSection title="效率工具" cmds={[
          ['/plan', 'AI 生成今日计划'],
          ['/standup', 'AI 站会发言稿'],
          ['/review', 'AI 每日回顾'],
          ['/timer N', '番茄计时 N 分钟'],
          ['/stop', '停止计时'],
        ]} />
        <CmdSection title="任务 & 笔记" cmds={[
          ['/task 标题', '创建任务'],
          ['todo 标题', '快速创建任务'],
          ['/note 内容', '记录笔记'],
          ['note 内容', '快速记笔记'],
        ]} />
      </Box>
      <Box flexDirection="column" width={col}>
        <CmdSection title="开发助手" cmds={[
          ['/code 需求', '生成实现代码'],
          ['/debug 错误', '调试分析修复'],
          ['/explain 内容', '解释代码/概念'],
          ['/refactor 代码', '重构优化'],
        ]} />
        <CmdSection title="写作 & 研究" cmds={[
          ['/write 需求', '内容创作'],
          ['/research 主题', '深度研究分析'],
          ['/summary 内容', '提炼摘要'],
          ['/translate 文本', '中英互译'],
        ]} />
        <CmdSection title="对话管理" cmds={[
          ['/new', '新建对话 (清空历史)'],
          ['/clear', '清空当前内容'],
          ['/help', '查看此帮助'],
          ['/exit', '退出程序'],
        ]} />
        <Box marginTop={1}>
          <Text color={theme.colors.muted}>
            自然语言: todo X | note X | timer N{'\n'}
            plan / standup → 直接触发 AI 分析
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function TabBtn({ label, active }: { label: string; active: boolean }) {
  return (
    <Text
      color={active ? theme.colors.background : theme.colors.muted}
      backgroundColor={active ? theme.colors.primary : undefined}
      bold={active}
    >
      {' '}{label}{' '}
    </Text>
  );
}

function Section({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.colors.accent} bold>{title}</Text>
      {items.map(([key, desc]) => (
        <Box key={key}>
          <Box width={14} flexShrink={0}>
            <Text color={theme.colors.primary}>{key}</Text>
          </Box>
          <Text color={theme.colors.muted}>{desc}</Text>
        </Box>
      ))}
    </Box>
  );
}

function CmdSection({ title, cmds }: { title: string; cmds: [string, string][] }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.colors.accent} bold>{title}</Text>
      {cmds.map(([cmd, desc]) => (
        <Box key={cmd}>
          <Box width={18} flexShrink={0}>
            <Text color={theme.colors.primary}>{cmd}</Text>
          </Box>
          <Text color={theme.colors.muted}>{desc}</Text>
        </Box>
      ))}
    </Box>
  );
}
