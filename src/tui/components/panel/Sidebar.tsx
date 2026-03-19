/**
 * Sidebar - 重构后的侧边栏组件
 * 使用新的 TUI 架构: Selectable, Focusable
 */

import React, { useState } from 'react';
import { Box, Text, type Key } from 'ink';
import { theme, icons, formatTime, formatDate, truncate } from '../../../theme/index.js';
import { Focusable, FocusLayer } from '../../contexts/FocusContext.js';
import { Selectable, SelectableItem } from '../ui/Selectable.js';
import type { CalendarEvent, Email, Meeting } from '../../types/ui.js';

type TabType = 'calendar' | 'email' | 'meetings';

interface SidebarProps {
  events: CalendarEvent[];
  emails: Email[];
  meetings: Meeting[];
  loading?: boolean;
  height: number;
  width: number;
  focusId?: string;
}

const tabs: { id: TabType; label: string; icon: string }[] = [
  { id: 'calendar', label: 'Calendar', icon: icons.calendar },
  { id: 'email', label: 'Mail', icon: icons.email },
  { id: 'meetings', label: 'Meet', icon: icons.meeting },
];

export function Sidebar({
  events,
  emails,
  meetings,
  loading = false,
  height,
  width,
  focusId = 'sidebar',
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('calendar');
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  
  // Keyboard handler for tab switching
  const handleKey = (input: string, key: Key): boolean => {
    if (input === '1') {
      setActiveTab('calendar');
      setSelectedTabIndex(0);
      return true;
    }
    if (input === '2') {
      setActiveTab('email');
      setSelectedTabIndex(1);
      return true;
    }
    if (input === '3') {
      setActiveTab('meetings');
      setSelectedTabIndex(2);
      return true;
    }
    if (key.leftArrow) {
      const newIndex = selectedTabIndex > 0 ? selectedTabIndex - 1 : tabs.length - 1;
      setSelectedTabIndex(newIndex);
      setActiveTab(tabs[newIndex].id);
      return true;
    }
    if (key.rightArrow) {
      const newIndex = selectedTabIndex < tabs.length - 1 ? selectedTabIndex + 1 : 0;
      setSelectedTabIndex(newIndex);
      setActiveTab(tabs[newIndex].id);
      return true;
    }
    return false;
  };
  
  const contentHeight = height - 6;
  
  return (
    <Focusable
      id={focusId}
      layer={FocusLayer.SIDEBAR}
      showIndicator
      indicatorStyle="border"
      onKey={handleKey}
      width={width}
      height={height}
      flexDirection="column"
    >
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
        {loading ? (
          <LoadingState />
        ) : (
          <>
            {activeTab === 'calendar' && <CalendarTab events={events} maxItems={Math.floor(contentHeight / 2)} />}
            {activeTab === 'email' && <EmailTab emails={emails} maxItems={Math.floor(contentHeight / 3)} />}
            {activeTab === 'meetings' && <MeetingsTab meetings={meetings} maxItems={Math.floor(contentHeight / 3)} />}
          </>
        )}
      </Box>

      {/* Keyboard hints */}
      <Box paddingX={1} paddingY={0.5} borderTop borderStyle="single" borderColor={theme.colors.border}>
        <Text color={theme.colors.muted}>1/2/3: Switch | ←/→: Navigate</Text>
      </Box>
    </Focusable>
  );
}

function LoadingState() {
  return (
    <Box flexDirection="column">
      <Text color={theme.colors.muted}>{'█'.repeat(12)}</Text>
      <Box marginTop={1}>
        <Text color={theme.colors.muted}>{'█'.repeat(8)}</Text>
      </Box>
    </Box>
  );
}

interface TabProps {
  maxItems: number;
}

function CalendarTab({ events, maxItems }: { events: CalendarEvent[] } & TabProps) {
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
