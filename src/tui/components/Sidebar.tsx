import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { theme, icons, formatTime, formatDate, truncate } from '../theme.js';

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
}

export function Sidebar({ events, emails, meetings, loading }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('calendar');

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={theme.colors.muted}>Loading...</Text>
      </Box>
    );
  }

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
        <Box marginRight={2}>
          <Text 
            color={activeTab === 'calendar' ? theme.colors.primary : theme.colors.muted}
            bold={activeTab === 'calendar'}
          >
            {icons.calendar} Cal
          </Text>
        </Box>
        <Box marginRight={2}>
          <Text 
            color={activeTab === 'email' ? theme.colors.primary : theme.colors.muted}
            bold={activeTab === 'email'}
          >
            {icons.email} Mail
          </Text>
        </Box>
        <Box>
          <Text 
            color={activeTab === 'meetings' ? theme.colors.primary : theme.colors.muted}
            bold={activeTab === 'meetings'}
          >
            {icons.meeting} Meet
          </Text>
        </Box>
      </Box>

      {/* Content */}
      <Box flexDirection="column" padding={1} flexGrow={1}>
        {activeTab === 'calendar' && <CalendarTab events={events} />}
        {activeTab === 'email' && <EmailTab emails={emails} />}
        {activeTab === 'meetings' && <MeetingsTab meetings={meetings} />}
      </Box>

      {/* Keyboard hints */}
      <Box paddingX={1} paddingY={0.5} borderTop borderStyle="single" borderColor={theme.colors.border}>
        <Text color={theme.colors.muted}>Tab: Switch View</Text>
      </Box>
    </Box>
  );
}

function CalendarTab({ events }: { events: Event[] }) {
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
          events.slice(0, 6).map(event => (
            <Box key={event.id} marginY={0.5} flexDirection="column">
              <Box>
                <Text color={theme.colors.time}>{formatTime(event.startTime)} </Text>
                <Text color={theme.colors.text}>{truncate(event.title, 20)}</Text>
              </Box>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}

function EmailTab({ emails }: { emails: Email[] }) {
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
        {emails.slice(0, 5).map(email => (
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
      </Box>
    </Box>
  );
}

function MeetingsTab({ meetings }: { meetings: Meeting[] }) {
  return (
    <Box flexDirection="column">
      <Text color={theme.colors.muted}>
        {meetings.length} upcoming
      </Text>
      <Box marginTop={1} flexDirection="column">
        {meetings.slice(0, 5).map(meeting => (
          <Box key={meeting.id} marginY={0.5} flexDirection="column">
            <Box>
              <Text color={theme.colors.time}>{formatTime(meeting.time)} </Text>
              <Text color={theme.colors.warning}>{meeting.duration}m</Text>
            </Box>
            <Text color={theme.colors.text}>{truncate(meeting.title, 22)}</Text>
            <Text color={theme.colors.muted}>
              {meeting.attendees} attendees
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
