#!/usr/bin/env node
/**
 * HyperTerminal Workbench
 * 
 * 团队管理工作台 - 面向团队管理者和成员
 * 整合团队工作、个人任务、沟通协作于一体
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useApp, useStdout, Spacer } from 'ink';
import { tuiTheme as theme, icons, layout, formatTime, truncate } from '../theme/index.js';
import type {
  Team, TeamMember, Channel, Message, TeamWorkflow,
  PresenceStatus,
} from '../types/collaboration.js';

// 工作台主区域类型
type MainView = 'dashboard' | 'messages' | 'tasks' | 'calendar' | 'workflows' | 'team' | 'settings';
type SidebarView = 'activities' | 'members' | 'workflows-list' | 'quick-actions';

// 个人任务类型
interface PersonalTask {
  id: string;
  title: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  category: 'work' | 'personal' | 'team';
  dueDate?: Date;
  assignee?: string;
}

// 通知类型
interface Notification {
  id: string;
  type: 'mention' | 'task' | 'workflow' | 'system' | 'message';
  title: string;
  content: string;
  timestamp: Date;
  read: boolean;
  source?: string;
}

export default function Workbench() {
  useApp();
  const { stdout } = useStdout();
  
  // 核心状态
  const [currentUser] = useState({
    id: 'user-1',
    name: 'Alex Chen',
    avatar: '👤',
    role: 'Team Lead',
    status: 'online' as PresenceStatus,
  });
  
  const [currentTeam] = useState<Team | null>({
    id: 'team-1',
    name: 'Product Squad',
    description: 'Core product development team',
    ownerId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    settings: {
      allowGuestAccess: false,
      requireApproval: true,
      defaultChannelType: 'public',
      maxMembers: 20,
      retentionDays: 90,
      enableAgentCollaboration: true,
      agentAutoJoin: true,
    },
  });
  
  // 视图状态
  const [mainView, setMainView] = useState<MainView>('dashboard');
  const [sidebarView, setSidebarView] = useState<SidebarView>('activities');
  const [selectedChannel, setSelectedChannel] = useState<string>('general');
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  
  // 终端尺寸
  const [terminalSize, setTerminalSize] = useState({
    width: stdout.columns || 120,
    height: stdout.rows || 40,
  });
  
  // 模拟数据
  const [notifications, setNotifications] = useState<Notification[]>([
    { id: '1', type: 'mention', title: 'New mention', content: '@alex review the PR please', timestamp: new Date(Date.now() - 300000), read: false, source: '#dev-channel' },
    { id: '2', type: 'task', title: 'Task assigned', content: 'Update documentation', timestamp: new Date(Date.now() - 600000), read: false },
    { id: '3', type: 'workflow', title: 'Workflow completed', content: 'Daily standup notes generated', timestamp: new Date(Date.now() - 1800000), read: true },
  ]);
  
  const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>([
    { id: '1', title: 'Review Q4 roadmap', completed: false, priority: 'high', category: 'work', dueDate: new Date() },
    { id: '2', title: 'Team 1:1 meetings', completed: false, priority: 'high', category: 'work', dueDate: new Date() },
    { id: '3', title: 'Buy groceries', completed: false, priority: 'medium', category: 'personal' },
    { id: '4', title: 'Prepare presentation', completed: true, priority: 'high', category: 'work' },
  ]);
  
  const [channels] = useState<Channel[]>([
    { id: 'general', teamId: 'team-1', name: 'general', displayName: '🏠 general', type: 'public', createdBy: 'user-1', createdAt: new Date(), updatedAt: new Date(), members: [], settings: { allowThreads: true, allowReactions: true, allowFiles: true, allowAgentCommands: true, slowModeSeconds: 0 } },
    { id: 'dev', teamId: 'team-1', name: 'dev', displayName: '💻 development', type: 'public', createdBy: 'user-1', createdAt: new Date(), updatedAt: new Date(), members: [], settings: { allowThreads: true, allowReactions: true, allowFiles: true, allowAgentCommands: true, slowModeSeconds: 0 } },
    { id: 'design', teamId: 'team-1', name: 'design', displayName: '🎨 design', type: 'public', createdBy: 'user-1', createdAt: new Date(), updatedAt: new Date(), members: [], settings: { allowThreads: true, allowReactions: true, allowFiles: true, allowAgentCommands: true, slowModeSeconds: 0 } },
    { id: 'random', teamId: 'team-1', name: 'random', displayName: '😄 random', type: 'public', createdBy: 'user-1', createdAt: new Date(), updatedAt: new Date(), members: [], settings: { allowThreads: true, allowReactions: true, allowFiles: true, allowAgentCommands: true, slowModeSeconds: 0 } },
  ]);
  
  const [messages] = useState<Message[]>([
    { id: '1', channelId: 'general', teamId: 'team-1', authorId: 'user-2', authorName: 'Sarah', type: 'text', content: 'Good morning team! ☀️', createdAt: new Date(Date.now() - 3600000), reactions: [], attachments: [], mentions: [], isAgent: false },
    { id: '2', channelId: 'general', teamId: 'team-1', authorId: 'agent-1', authorName: 'Assistant', type: 'agent', content: 'Daily standup summary is ready. 3 tasks completed yesterday, 2 pending.', createdAt: new Date(Date.now() - 3500000), reactions: [], attachments: [], mentions: [], isAgent: true, agentId: 'agent-1' },
    { id: '3', channelId: 'general', teamId: 'team-1', authorId: 'user-3', authorName: 'Mike', type: 'text', content: '@alex can you review the PR when you have a moment?', createdAt: new Date(Date.now() - 300000), reactions: [], attachments: [], mentions: ['user-1'], isAgent: false },
  ]);
  
  const [teamMembers] = useState<TeamMember[]>([
    { id: '1', teamId: 'team-1', userId: 'user-1', userName: 'Alex Chen', role: 'owner', joinedAt: new Date(), lastActiveAt: new Date(), presence: 'online', preferences: { notifications: { email: true, push: true, mention: true, workflow: true }, theme: 'dark', language: 'en' }, isAgent: false },
    { id: '2', teamId: 'team-1', userId: 'user-2', userName: 'Sarah Kim', role: 'admin', joinedAt: new Date(), lastActiveAt: new Date(), presence: 'online', preferences: { notifications: { email: true, push: true, mention: true, workflow: true }, theme: 'dark', language: 'en' }, isAgent: false },
    { id: '3', teamId: 'team-1', userId: 'user-3', userName: 'Mike Ross', role: 'member', joinedAt: new Date(), lastActiveAt: new Date(), presence: 'away', preferences: { notifications: { email: true, push: true, mention: true, workflow: true }, theme: 'dark', language: 'en' }, isAgent: false },
    { id: '4', teamId: 'team-1', userId: 'agent-1', userName: 'Work Assistant', role: 'member', joinedAt: new Date(), lastActiveAt: new Date(), presence: 'online', preferences: { notifications: { email: false, push: false, mention: false, workflow: false }, theme: 'dark', language: 'en' }, isAgent: true, agentId: 'agent-1' },
  ]);
  
  const [workflows] = useState<TeamWorkflow[]>([
    { id: '1', teamId: 'team-1', name: 'Daily Standup', description: 'Automated daily standup collection', createdBy: 'user-1', createdAt: new Date(), updatedAt: new Date(), isActive: true, trigger: { type: 'schedule', config: { cron: '0 9 * * 1-5' } }, steps: [], variables: {}, permissions: { canEdit: [], canExecute: [], canView: [] } },
    { id: '2', teamId: 'team-1', name: 'Code Review', description: 'Assign code reviewers automatically', createdBy: 'user-1', createdAt: new Date(), updatedAt: new Date(), isActive: true, trigger: { type: 'event', config: { event: 'pr.created' } }, steps: [], variables: {}, permissions: { canEdit: [], canExecute: [], canView: [] } },
  ]);
  
  // 监听终端尺寸变化
  useEffect(() => {
    const handleResize = () => {
      setTerminalSize({ width: stdout.columns || 120, height: stdout.rows || 40 });
    };
    stdout.on('resize', handleResize);
    return () => { stdout.off('resize', handleResize); };
  }, [stdout]);
  
  // 键盘快捷键处理
  useInput((input, key) => {
    // 关闭弹窗
    if (key.escape) {
      if (showCommandPalette) setShowCommandPalette(false);
      else if (showNotifications) setShowNotifications(false);
      else if (showProfile) setShowProfile(false);
      return;
    }
    
    // 全局快捷键
    if (key.ctrl && input === 'p') {
      setShowCommandPalette(true);
      return;
    }
    if (key.ctrl && input === 'n') {
      setShowNotifications(prev => !prev);
      return;
    }
    
    // 数字键切换主视图
    if (!showCommandPalette && !showNotifications) {
      if (input === '1') setMainView('dashboard');
      if (input === '2') setMainView('messages');
      if (input === '3') setMainView('tasks');
      if (input === '4') setMainView('calendar');
      if (input === '5') setMainView('workflows');
      if (input === '6') setMainView('team');
    }
  });
  
  // 计算布局
  const layout = useMemo(() => {
    const { width, height } = terminalSize;
    const headerHeight = 3;
    const footerHeight = 3;
    const sidebarWidth = 35;
    const contentHeight = height - headerHeight - footerHeight;
    
    return {
      width, height, headerHeight, footerHeight, sidebarWidth, contentHeight,
      mainWidth: width - sidebarWidth - 2,
    };
  }, [terminalSize]);
  
  // 待办事项统计
  const taskStats = useMemo(() => {
    const total = personalTasks.length;
    const completed = personalTasks.filter(t => t.completed).length;
    const highPriority = personalTasks.filter(t => !t.completed && t.priority === 'high').length;
    const workTasks = personalTasks.filter(t => t.category === 'work' && !t.completed).length;
    return { total, completed, highPriority, workTasks, pending: total - completed };
  }, [personalTasks]);
  
  // 未读通知数
  const unreadCount = notifications.filter(n => !n.read).length;
  
  return (
    <Box flexDirection="column" width={layout.width} height={layout.height}>
      {/* 顶部导航栏 */}
      <TopBar 
        currentUser={currentUser}
        currentTeam={currentTeam}
        mainView={mainView}
        unreadCount={unreadCount}
        onViewChange={setMainView}
        onToggleNotifications={() => setShowNotifications(!showNotifications)}
        onToggleProfile={() => setShowProfile(!showProfile)}
      />
      
      {/* 主内容区 */}
      <Box flexDirection="row" height={layout.contentHeight}>
        {/* 左侧导航 */}
        <LeftNav 
          mainView={mainView}
          onViewChange={setMainView}
          taskStats={taskStats}
        />
        
        {/* 主内容 */}
        <Box flexDirection="column" width={layout.mainWidth}>
          {mainView === 'dashboard' && (
            <DashboardView 
              tasks={personalTasks}
              messages={messages}
              workflows={workflows}
              members={teamMembers}
              onTaskToggle={(id) => {
                setPersonalTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
              }}
            />
          )}
          {mainView === 'messages' && (
            <MessagesView 
              channels={channels}
              messages={messages}
              selectedChannel={selectedChannel}
              onChannelSelect={setSelectedChannel}
              currentUser={currentUser}
            />
          )}
          {mainView === 'tasks' && (
            <TasksView 
              tasks={personalTasks}
              onTaskToggle={(id) => {
                setPersonalTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
              }}
            />
          )}
          {mainView === 'workflows' && (
            <WorkflowsView workflows={workflows} />
          )}
          {mainView === 'team' && (
            <TeamView members={teamMembers} />
          )}
        </Box>
        
        {/* 右侧边栏 */}
        <RightSidebar 
          view={sidebarView}
          notifications={notifications}
          members={teamMembers}
          workflows={workflows}
          onViewChange={setSidebarView}
        />
      </Box>
      
      {/* 底部状态栏 */}
      <BottomBar 
        currentView={mainView}
        onCommandPalette={() => setShowCommandPalette(true)}
      />
      
      {/* 弹窗覆盖层 */}
      {showCommandPalette && (
        <CommandPalette 
          onClose={() => setShowCommandPalette(false)}
          onSelect={(_command) => {
            // 处理命令
            setShowCommandPalette(false);
          }}
        />
      )}
      
      {showNotifications && (
        <NotificationsPanel 
          notifications={notifications}
          onClose={() => setShowNotifications(false)}
          onMarkRead={(id) => {
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
          }}
        />
      )}
    </Box>
  );
}

// ============================================================================
// 组件定义
// ============================================================================

function TopBar({ currentUser, currentTeam, mainView, unreadCount, onViewChange, onToggleNotifications }: any) {
  return (
    <Box height={3} borderStyle="single" borderColor={theme.colors.primary} paddingX={1}>
      {/* 左侧：团队和用户信息 */}
      <Box width="40%">
        <Text color={theme.colors.primary} bold>
          {icons.building} {currentTeam?.name || 'No Team'}
        </Text>
        <Text color={theme.colors.muted}> | </Text>
        <Text color={theme.colors.text}>
          {currentUser.avatar} {currentUser.name}
        </Text>
        <Text color={theme.colors.success}> ●</Text>
      </Box>
      
      {/* 中间：当前视图标题 */}
      <Box width="30%" justifyContent="center">
        <Text color={theme.colors.accent} bold>
          {mainView === 'dashboard' && `${icons.stats} Dashboard`}
          {mainView === 'messages' && `${icons.chat} Messages`}
          {mainView === 'tasks' && `${icons.check} Tasks`}
          {mainView === 'calendar' && `${icons.calendar} Calendar`}
          {mainView === 'workflows' && `${icons.running} Workflows`}
          {mainView === 'team' && `${icons.user} Team`}
        </Text>
      </Box>
      
      {/* 右侧：通知和快捷操作 */}
      <Box width="30%" justifyContent="flex-end">
        <Box marginRight={2}>
          <Text color={unreadCount > 0 ? theme.colors.warning : theme.colors.muted}>
            {icons.bell} {unreadCount > 0 ? `${unreadCount} unread` : '0'}
          </Text>
        </Box>
        <Box>
          <Text color={theme.colors.muted}>Ctrl+P:Cmd | 1-6:Nav</Text>
        </Box>
      </Box>
    </Box>
  );
}

function LeftNav({ mainView, onViewChange, taskStats }: any) {
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: icons.stats, shortcut: '1' },
    { id: 'messages', label: 'Messages', icon: icons.chat, shortcut: '2', badge: 3 },
    { id: 'tasks', label: 'Tasks', icon: icons.check, shortcut: '3', badge: taskStats.pending },
    { id: 'calendar', label: 'Calendar', icon: icons.calendar, shortcut: '4' },
    { id: 'workflows', label: 'Workflows', icon: icons.running, shortcut: '5' },
    { id: 'team', label: 'Team', icon: icons.user, shortcut: '6' },
  ];
  
  return (
    <Box flexDirection="column" width={20} borderStyle="single" borderColor={theme.colors.border} paddingY={1}>
      <Box paddingX={1} marginBottom={1}>
        <Text color={theme.colors.muted} bold>MENU</Text>
      </Box>
      {items.map(item => (
        <Box 
          key={item.id} 
          paddingX={1} 
          paddingY={0.5}
          backgroundColor={mainView === item.id ? theme.colors.surfaceLight : undefined}
        >
          <Text 
            color={mainView === item.id ? theme.colors.primary : theme.colors.text}
            bold={mainView === item.id}
            onPress={() => onViewChange(item.id)}
          >
            {item.icon} {item.label}
            {item.badge ? ` ${item.badge}` : ''}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

function DashboardView({ tasks, messages, workflows, members, onTaskToggle }: any) {
  const today = new Date();
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  
  // 获取今日任务
  const todayTasks = tasks.filter((t: any) => !t.completed && t.category === 'work');
  // 获取最近消息
  const recentMessages = messages.slice(-3);
  // 获取在线成员
  const onlineMembers = members.filter((m: any) => m.presence === 'online');
  
  return (
    <Box flexDirection="column" padding={1}>
      {/* 欢迎语 */}
      <Box marginBottom={1}>
        <Text color={theme.colors.primary} bold>{greeting}, Alex! 👋</Text>
      </Box>
      
      {/* 概览卡片 */}
      <Box flexDirection="row" marginBottom={1}>
        <DashboardCard title="Today's Tasks" icon={icons.check} color={theme.colors.warning}>
          <Text color={theme.colors.text} bold>{todayTasks.length} pending</Text>
          <Text color={theme.colors.muted}>3 high priority</Text>
        </DashboardCard>
        <DashboardCard title="Team Online" icon={icons.user} color={theme.colors.success}>
          <Text color={theme.colors.text} bold>{onlineMembers.length} online</Text>
          <Text color={theme.colors.muted}>of 8 members</Text>
        </DashboardCard>
        <DashboardCard title="Active Workflows" icon={icons.running} color={theme.colors.info}>
          <Text color={theme.colors.text} bold>{workflows.length} running</Text>
          <Text color={theme.colors.muted}>2 completed today</Text>
        </DashboardCard>
      </Box>
      
      {/* 今日待办 */}
      <Box borderStyle="single" borderColor={theme.colors.border} padding={1} marginBottom={1}>
        <Text color={theme.colors.primary} bold marginBottom={1}>📋 Today's Focus</Text>
        {todayTasks.slice(0, 5).map((task: any) => (
          <Box key={task.id} flexDirection="row" marginY={0.5}>
            <Text color={task.completed ? theme.colors.success : theme.colors.muted}>
              {task.completed ? icons.check : icons.pending} 
            </Text>
            <Text color={theme.colors.text}> {truncate(task.title, 40)}</Text>
            {task.priority === 'high' && <Text color={theme.colors.error}> !</Text>}
          </Box>
        ))}
        {todayTasks.length === 0 && (
          <Text color={theme.colors.muted}>No pending tasks for today 🎉</Text>
        )}
      </Box>
      
      {/* 最近动态 */}
      <Box borderStyle="single" borderColor={theme.colors.border} padding={1}>
        <Text color={theme.colors.primary} bold marginBottom={1}>💬 Recent Activity</Text>
        {recentMessages.map((msg: any) => (
          <Box key={msg.id} marginY={0.5}>
            <Text color={theme.colors.muted}>{msg.authorName}:</Text>
            <Text color={theme.colors.text}> {truncate(msg.content, 50)}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function DashboardCard({ title, icon, color, children }: any) {
  return (
    <Box 
      width={20} 
      borderStyle="single" 
      borderColor={color} 
      padding={1} 
      marginRight={1}
      flexDirection="column"
    >
      <Text color={color}>{icon} {title}</Text>
      {children}
    </Box>
  );
}

function MessagesView({ channels, messages, selectedChannel, onChannelSelect, currentUser }: any) {
  const channelMessages = messages.filter((m: any) => m.channelId === selectedChannel);
  
  return (
    <Box flexDirection="column" height="100%">
      {/* 频道列表 */}
      <Box flexDirection="row" borderBottom borderColor={theme.colors.border} paddingX={1}>
        {channels.map((ch: any) => (
          <Box 
            key={ch.id} 
            paddingX={2} 
            paddingY={0.5}
            borderStyle={selectedChannel === ch.id ? 'single' : undefined}
            borderColor={theme.colors.primary}
          >
            <Text 
              color={selectedChannel === ch.id ? theme.colors.primary : theme.colors.muted}
              bold={selectedChannel === ch.id}
              onPress={() => onChannelSelect(ch.id)}
            >
              {ch.displayName}
            </Text>
          </Box>
        ))}
      </Box>
      
      {/* 消息列表 */}
      <Box flexDirection="column" flexGrow={1} padding={1}>
        {channelMessages.map((msg: any) => (
          <Box key={msg.id} flexDirection="column" marginY={0.5}>
            <Box>
              <Text color={msg.isAgent ? theme.colors.secondary : theme.colors.primary} bold>
                {msg.authorName}
              </Text>
              <Text color={theme.colors.muted}> {formatTime(msg.createdAt)}</Text>
            </Box>
            <Text color={theme.colors.text}>  {msg.content}</Text>
          </Box>
        ))}
      </Box>
      
      {/* 输入框 */}
      <Box borderStyle="single" borderColor={theme.colors.border} paddingX={1}>
        <Text color={theme.colors.muted}>Message #{selectedChannel}...</Text>
      </Box>
    </Box>
  );
}

function TasksView({ tasks, onTaskToggle }: any) {
  const categories = ['work', 'personal', 'team'] as const;
  
  return (
    <Box flexDirection="column" padding={1}>
      <Text color={theme.colors.primary} bold marginBottom={1}>📋 All Tasks</Text>
      {categories.map(cat => {
        const catTasks = tasks.filter((t: any) => t.category === cat);
        return (
          <Box key={cat} flexDirection="column" marginBottom={1}>
            <Text color={theme.colors.accent} bold>
              {cat === 'work' && '💼 Work'}
              {cat === 'personal' && '🏠 Personal'}
              {cat === 'team' && '👥 Team'}
            </Text>
            {catTasks.map((task: any) => (
              <Box key={task.id} flexDirection="row" marginY={0.5} paddingX={2}>
                <Text 
                  color={task.completed ? theme.colors.success : theme.colors.muted}
                  onPress={() => onTaskToggle(task.id)}
                >
                  {task.completed ? icons.checkHeavy : icons.pending}
                </Text>
                <Text color={task.completed ? theme.colors.muted : theme.colors.text} strikethrough={task.completed}>
                  {' '}{task.title}
                </Text>
                {task.priority === 'high' && !task.completed && (
                  <Text color={theme.colors.error}> 🔥</Text>
                )}
              </Box>
            ))}
          </Box>
        );
      })}
    </Box>
  );
}

function WorkflowsView({ workflows }: any) {
  return (
    <Box flexDirection="column" padding={1}>
      <Text color={theme.colors.primary} bold marginBottom={1}>⚡ Team Workflows</Text>
      {workflows.map((wf: any) => (
        <Box key={wf.id} borderStyle="single" borderColor={theme.colors.border} padding={1} marginY={0.5}>
          <Box flexDirection="row" justifyContent="space-between">
            <Text color={theme.colors.text} bold>{wf.name}</Text>
            <Text color={wf.isActive ? theme.colors.success : theme.colors.muted}>
              {wf.isActive ? '● Active' : '○ Inactive'}
            </Text>
          </Box>
          <Text color={theme.colors.muted}>{wf.description}</Text>
          <Text color={theme.colors.info}>Trigger: {wf.trigger.type}</Text>
        </Box>
      ))}
    </Box>
  );
}

function TeamView({ members }: any) {
  return (
    <Box flexDirection="column" padding={1}>
      <Text color={theme.colors.primary} bold marginBottom={1}>👥 Team Members</Text>
      {members.map((member: any) => (
        <Box key={member.id} flexDirection="row" marginY={0.5} paddingX={1}>
          <Text color={member.presence === 'online' ? theme.colors.success : theme.colors.muted}>
            {member.presence === 'online' ? '●' : '○'}
          </Text>
          <Text color={theme.colors.text} bold> {member.userName}</Text>
          {member.isAgent && <Text color={theme.colors.secondary}> 🤖</Text>}
          <Text color={theme.colors.muted}> ({member.role})</Text>
        </Box>
      ))}
    </Box>
  );
}

function RightSidebar({ view, notifications, members, workflows, onViewChange }: any) {
  return (
    <Box 
      flexDirection="column" 
      width={layout.sidebarWidthMax} 
      borderStyle="single" 
      borderColor={theme.colors.border}
      paddingY={1}
    >
      {/* 侧边栏切换 */}
      <Box flexDirection="row" justifyContent="center" marginBottom={1}>
        <Text color={theme.colors.muted}>F1:Act F2:Members</Text>
      </Box>
      
      {/* 活动内容 */}
      <Box paddingX={1}>
        <Text color={theme.colors.primary} bold marginBottom={1}>📊 Activity</Text>
        {notifications.slice(0, 5).map((n: any) => (
          <Box key={n.id} flexDirection="column" marginY={0.5}>
            <Text color={n.read ? theme.colors.muted : theme.colors.text} bold={!n.read}>
              {n.type === 'mention' && '@'}
              {n.type === 'task' && '✓'}
              {n.type === 'workflow' && '⚡'}
              {' '}{truncate(n.title, 20)}
            </Text>
            <Text color={theme.colors.muted}>{truncate(n.content, 25)}</Text>
          </Box>
        ))}
      </Box>
      
      <Box borderTop borderColor={theme.colors.border} marginY={1} />
      
      {/* 在线成员 */}
      <Box paddingX={1}>
        <Text color={theme.colors.primary} bold marginBottom={1}>● Online ({members.filter((m: any) => m.presence === 'online').length})</Text>
        {members.filter((m: any) => m.presence === 'online').map((m: any) => (
          <Box key={m.id} marginY={0.5}>
            <Text color={theme.colors.text}>{m.userName} {m.isAgent && '🤖'}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function BottomBar({ currentView, onCommandPalette }: any) {
  return (
    <Box height={3} borderStyle="single" borderColor={theme.colors.border} paddingX={1}>
      <Box width="50%">
        <Text color={theme.colors.muted}>
          Ctrl+P: Command | Ctrl+N: Notifications | ESC: Back
        </Text>
      </Box>
      <Box width="50%" justifyContent="flex-end">
        <Text color={theme.colors.muted}>
          HyperTerminal Workbench v0.3.0
        </Text>
      </Box>
    </Box>
  );
}

function CommandPalette({ onClose, onSelect }: any) {
  const commands = [
    { id: 'new-task', label: 'New Task', shortcut: 't' },
    { id: 'new-message', label: 'Send Message', shortcut: 'm' },
    { id: 'run-workflow', label: 'Run Workflow', shortcut: 'w' },
    { id: 'join-channel', label: 'Join Channel', shortcut: 'j' },
    { id: 'invite-member', label: 'Invite Member', shortcut: 'i' },
    { id: 'settings', label: 'Settings', shortcut: 's' },
    { id: 'help', label: 'Help', shortcut: 'h' },
    { id: 'quit', label: 'Quit', shortcut: 'q' },
  ];
  
  return (
    <Box 
      position="absolute" 
      marginLeft={20} 
      marginTop={5}
      width={50} 
      height={15}
      borderStyle="double"
      borderColor={theme.colors.primary}
      backgroundColor={theme.colors.surface}
      padding={1}
    >
      <Text color={theme.colors.primary} bold marginBottom={1}>⌘ Command Palette</Text>
      {commands.map(cmd => (
        <Box key={cmd.id} marginY={0.5}>
          <Text color={theme.colors.text}>{cmd.label}</Text>
          <Spacer />
          <Text color={theme.colors.muted}>{cmd.shortcut}</Text>
        </Box>
      ))}
    </Box>
  );
}

function NotificationsPanel({ notifications, onClose, onMarkRead }: any) {
  return (
    <Box 
      position="absolute" 
      marginLeft={40} 
      marginTop={3}
      width={45} 
      height={20}
      borderStyle="double"
      borderColor={theme.colors.warning}
      backgroundColor={theme.colors.surface}
      padding={1}
    >
      <Text color={theme.colors.warning} bold marginBottom={1}>🔔 Notifications</Text>
      {notifications.map((n: any) => (
        <Box key={n.id} marginY={0.5} flexDirection="column">
          <Text color={n.read ? theme.colors.muted : theme.colors.text} bold={!n.read}>
            {n.title}
          </Text>
          <Text color={theme.colors.muted}>{truncate(n.content, 35)}</Text>
        </Box>
      ))}
    </Box>
  );
}
