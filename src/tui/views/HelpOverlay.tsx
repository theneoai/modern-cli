/**
 * HelpOverlay.tsx - 完整快捷键参考 + 场景流程
 * 按 ? 或 /help 显示
 */

import React, { useState } from 'react';
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
        <Text color={theme.colors.primary} bold>⌨  HyperTerminal 使用指南</Text>
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

function KeysTab({ height, width }: { height: number; width: number }) {
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
      title: '🌅 晨间规划 (传统: 5次切换)',
      traditional: ['打开日历 App (切换1)', '查看邮件 App (切换2)', '打开 Todo App (切换3)', '打开笔记 App (切换4)', '手写或整理计划 (切换5)'],
      cli: ['❯ plan', '  → AI 读取任务列表生成时间块', '  → 直接建议优先级', '  → 一句话补充: todo 重要会议'],
      interrupts: { before: 5, after: 0 },
    },
    {
      title: '💼 项目管理 (传统: 8次切换)',
      traditional: ['Jira/Linear (切换1)', 'Slack 沟通 (切换2)', 'GitHub PR (切换3)', 'Email 跟进 (切换4)', '文档工具 (切换5+)'],
      cli: ['❯ todo 完成 PR #42 代码审查', '❯ /code 帮我实现用户认证', '❯ /debug 这个报错是什么意思...', '❯ /review  ← 一键回顾今日'],
      interrupts: { before: 8, after: 1 },
    },
    {
      title: '📚 学习研究 (传统: 6次切换)',
      traditional: ['Google 搜索 (切换1)', '多标签页浏览 (切换2-4)', '复制到笔记 (切换5)', '整理思维导图 (切换6)'],
      cli: ['❯ /research React 18 并发特性', '  → AI 深度分析, 来源梳理', '❯ note 并发渲染原理: startTransition...', '❯ Ctrl+3 → 查看刚记录的笔记'],
      interrupts: { before: 6, after: 0 },
    },
    {
      title: '💻 开发编码 (传统: 10次切换)',
      traditional: ['IDE 编码', 'Stack Overflow (切换1)', 'GitHub Copilot (切换2)', 'Terminal 测试 (切换3)', 'Docs 查阅 (切换4+)'],
      cli: ['❯ /explain async/await 原理', '❯ /code 实现 JWT 认证中间件', '❯ /debug Cannot read property of undefined', '❯ /refactor [粘贴代码] 请优化'],
      interrupts: { before: 10, after: 0 },
    },
    {
      title: '✍ 写作创作 (传统: 4次切换)',
      traditional: ['文档工具 (切换1)', '参考资料 (切换2)', '拼写检查工具 (切换3)', '格式调整 (切换4)'],
      cli: ['❯ /write 给团队写一封发布通知邮件', '❯ /translate 翻译以上内容为英文', '❯ /summary 帮我总结上面这段', 'note 关键措辞备忘...'],
      interrupts: { before: 4, after: 0 },
    },
    {
      title: '🍅 专注工作 (传统: 无法计时)',
      traditional: ['找计时器 App (切换1)', '设置时间 (切换2)', '切换回工作 (切换3)', '看时间 (频繁切换)'],
      cli: ['❯ timer 25', '  → 标题栏显示 ⏱ 24:59 实时倒计时', '  → 到点自动提醒', '❯ timer 5  ← 休息'],
      interrupts: { before: 4, after: 0 },
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
  wf: {
    title: string;
    traditional: string[];
    cli: string[];
    interrupts: { before: number; after: number };
  };
  width: number;
}) {
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
      <Text color={theme.colors.accent} bold>{wf.title}</Text>
      <Box>
        <Text color={theme.colors.error}>传统 {wf.interrupts.before} 次打断</Text>
        <Text color={theme.colors.muted}> → </Text>
        <Text color={theme.colors.success} bold>CLI {wf.interrupts.after} 次打断</Text>
      </Box>
      <Box flexDirection="row">
        <Box flexDirection="column" width={Math.floor(width / 2) - 2} marginRight={1}>
          {wf.traditional.slice(0, 3).map((s, i) => (
            <Text key={i} color={theme.colors.muted}>{s}</Text>
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
