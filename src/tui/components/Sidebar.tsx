import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme, icons, formatTime, formatDate, truncate } from '../../theme/index.js';

type TabType = 'calendar' | 'email' | 'meetings';

interface Event {
  id: string;
  title: string;
  startTime: Date;
  endTime?: Date;
  type: 'event' | 'reminder';
}

interface Email {
  id: string;
  subject: string;
  from: string;
  preview: string;
  read: boolean;
  receivedAt: Date;
  priority: 'high' | 'normal' | 'low';
}

interface Meeting {
  id: string;
  title: string;
  time: Date;
  duration: number;
  attendees: number;
  link?: string;
}

interface SidebarProps {
  events: Event[];
  emails: Email[];
  meetings: Meeting[];
  loading: boolean;
  height: number;
  width: number;
}

const tabs: { id: TabType; label: string; icon: string }[] = [
  { id: 'calendar', label: 'Cal', icon: icons.calendar },
  { id: 'email', label: 'Mail', icon: icons.email },
  { id: 'meetings', label: 'Meet', icon: icons.meeting },
];

function SkeletonItem({ width }: { width: number }) {
  return (
    <Box marginY={0.5} flexDirection="column">
      <Box>
        <Text color={theme.colors.muted}>{'█'.repeat(5)} </Text>
        <Text color={theme.colors.muted}>{'█'.repeat(Math.min(20, width - 10))}</Text>
      </Box>
      <Text color={theme.colors.muted}>{'█'.repeat(Math.min(18, width - 8))}</Text>
    </Box>
  );
}

function SidebarSkeleton({ height, width }: { height: number; width: number }) {
  return (
    <Box flexDirection="column" padding={1} height={height}>
      <Box marginBottom={1}>
        <Text color={theme.colors.muted}>{'█'.repeat(12)}</Text>
      </Box>
      <Box marginBottom={1} flexDirection="row">
        <Text color={theme.colors.muted}>{'█'.repeat(4)} </Text>
        <Text color={theme.colors.muted}>{'█'.repeat(4)} </Text>
        <Text color={theme.colors.muted}>{'█'.repeat(4)}</Text>
      </Box>
      <Box flexDirection="column">
        {Array.from({ length: Math.max(3, Math.floor((height - 6) / 3)) }).map((_, i) => (
          <SkeletonItem key={i} width={width} />
        ))}
      </Box>
    </Box>
  );
}

export function Sidebar({ events, emails, meetings, loading, height, width }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('calendar');

  // Handle tab switching with number keys
  useInput((input, key) => {
    // Number keys 1, 2, 3 switch tabs
    if (input === '1') setActiveTab('calendar');
    if (input === '2') setActiveTab('email');
    if (input === '3') setActiveTab('meetings');
    
    // Left/Right arrows switch tabs
    if (key.leftArrow) {
      const currentIndex = tabs.findIndex(t => t.id === activeTab);
      const newIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
      setActiveTab(tabs[newIndex].id);
    }
    if (key.rightArrow) {
      const currentIndex = tabs.findIndex(t => t.id === activeTab);
      const newIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
      setActiveTab(tabs[newIndex].id);
    }
  });

  if (loading) {
    return <SidebarSkeleton height={height} width={width} />;
  }

  const contentHeight = height - 6; // Reserve space for header, tabs, and hints

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box padding={1} borderBottom borderStyle="single" borderColor={theme.colors.border}>
        <Text color={theme.colors.primary} bold>
          {icons.calendar} Personal Hub
        </Text>
      </Box>

      {/* Tab Navigation */}
      <Box paddingX={1} marginTop={1} flexDirection="row">
        {tabs.map((tab, index) => (
          <Box key={tab.id} marginRight={2}>
            <Text 
              color={activeTab === tab.id ? theme.colors.primary : theme.colors.muted}
              bold={activeTab === tab.id}
              backgroundColor={activeTab === tab.id ? theme.colors.surfaceLight : undefined}
            >
              {tab.icon} {index + 1}:{tab.label}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Content */}
      <Box flexDirection="column" padding={1} flexGrow={1} height={contentHeight}>
        {activeTab === 'calendar' && <CalendarTab events={events} maxItems={Math.floor(contentHeight / 2)} />}
        {activeTab === 'email' && <EmailTab emails={emails} maxItems={Math.floor(contentHeight / 3)} />}
        {activeTab === 'meetings' && <MeetingsTab meetings={meetings} maxItems={Math.floor(contentHeight / 3)} />}
      </Box>

      {/* Keyboard hints */}
      <Box paddingX={1} paddingY={0.5} borderTop borderStyle="single" borderColor={theme.colors.border}>
        <Text color={theme.colors.muted}>1/2/3: Switch | ←/→: Navigate</Text>
      </Box>
    </Box>
  );
}

interface TabProps {
  maxItems: number;
}

function CalendarTab({ events, maxItems }: { events: Event[] } & TabProps) {
  const today = new Date();
  
  return (
    <Box flexDirection="column">
      <Text color={theme.colors.muted} bold>
        {formatDate(today)}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {events.length === 0 ? (
          <Text color={theme.colors.muted} italic>No events today</Text>
        ) : (
          events.slice(0, maxItems).map(event => (
            <Box key={event.id} marginY={0.5} flexDirection="column">
              <Box>
                <Text color={theme.colors.info}>{formatTime(event.startTime)} </Text>
                <Text color={theme.colors.text}>{truncate(event.title, 20)}</Text>
              </Box>
            </Box>
          ))
        )}
        {events.length > maxItems && (
          <Text color={theme.colors.muted}>+{events.length - maxItems} more...</Text>
        )}
      </Box>
    </Box>
  );
}

function EmailTab({ emails, maxItems }: { emails: Email[] } & TabProps) {
  const unreadCount = emails.filter(e => !e.read).length;
  
  return (
    <Box flexDirection="column">
      <Text color={theme.colors.muted}>
        {unreadCount > 0 ? (
          <Text color={theme.colors.warning}>{unreadCount} unread</Text>
        ) : (
          'No new emails'
        )}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {emails.slice(0, maxItems).map(email => (
          <Box key={email.id} marginY={0.5} flexDirection="column">
            <Box>
              {!email.read && <Text color={theme.colors.primary}>● </Text>}
              <Text color={email.priority === 'high' ? theme.colors.warning : theme.colors.muted}>
                {truncate(email.from, 12)}
              </Text>
            </Box>
            <Text color={theme.colors.text} bold={!email.read}>
              {truncate(email.subject, 22)}
            </Text>
          </Box>
        ))}
        {emails.length > maxItems && (
          <Text color={theme.colors.muted}>+{emails.length - maxItems} more...</Text>
        )}
      </Box>
    </Box>
  );
}

function MeetingsTab({ meetings, maxItems }: { meetings: Meeting[] } & TabProps) {
  return (
    <Box flexDirection="column">
      <Text color={theme.colors.muted}>
        {meetings.length} upcoming
      </Text>
      <Box marginTop={1} flexDirection="column">
        {meetings.slice(0, maxItems).map(meeting => (
          <Box key={meeting.id} marginY={0.5} flexDirection="column">
            <Box>
              <Text color={theme.colors.info}>{formatTime(meeting.time)} </Text>
              <Text color={theme.colors.warning}>{meeting.duration}m</Text>
            </Box>
            <Text color={theme.colors.text}>{truncate(meeting.title, 22)}</Text>
            <Text color={theme.colors.muted}>
              {meeting.attendees} attendees
            </Text>
          </Box>
        ))}
        {meetings.length > maxItems && (
          <Text color={theme.colors.muted}>+{meetings.length - maxItems} more...</Text>
        )}
      </Box>
    </Box>
  );
}
