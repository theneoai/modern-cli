import { useState, useEffect, useCallback } from 'react';

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime?: Date;
  type: 'event' | 'reminder';
}

export interface Email {
  id: string;
  subject: string;
  from: string;
  preview: string;
  read: boolean;
  receivedAt: Date;
  priority: 'high' | 'normal' | 'low';
}

export interface Meeting {
  id: string;
  title: string;
  time: Date;
  duration: number;
  attendees: number;
  link?: string;
}

// Mock data for demo
const mockEvents: CalendarEvent[] = [
  {
    id: '1',
    title: 'Team Standup',
    startTime: new Date(new Date().setHours(9, 30)),
    endTime: new Date(new Date().setHours(9, 45)),
    type: 'event',
  },
  {
    id: '2',
    title: 'Project Review',
    startTime: new Date(new Date().setHours(14, 0)),
    endTime: new Date(new Date().setHours(15, 0)),
    type: 'event',
  },
  {
    id: '3',
    title: 'Call Mom',
    startTime: new Date(new Date().setHours(18, 0)),
    type: 'reminder',
  },
];

const mockEmails: Email[] = [
  {
    id: '1',
    subject: 'Q4 Planning Meeting',
    from: 'manager@company.com',
    preview: 'Let\'s discuss the roadmap for next quarter...',
    read: false,
    receivedAt: new Date(Date.now() - 3600000),
    priority: 'high',
  },
  {
    id: '2',
    subject: 'Design System Update',
    from: 'design@company.com',
    preview: 'New components are ready for review...',
    read: false,
    receivedAt: new Date(Date.now() - 7200000),
    priority: 'normal',
  },
  {
    id: '3',
    subject: 'Weekly Newsletter',
    from: 'newsletter@tech.com',
    preview: 'This week in AI and development...',
    read: true,
    receivedAt: new Date(Date.now() - 86400000),
    priority: 'low',
  },
];

const mockMeetings: Meeting[] = [
  {
    id: '1',
    title: 'Sprint Planning',
    time: new Date(new Date().setHours(10, 0)),
    duration: 60,
    attendees: 8,
    link: 'https://meet.google.com/abc-defg-hij',
  },
  {
    id: '2',
    title: 'Client Call',
    time: new Date(new Date().setHours(15, 30)),
    duration: 30,
    attendees: 4,
    link: 'https://zoom.us/j/123456789',
  },
];

export function useGoogleData() {
  const [events, setEvents] = useState<CalendarEvent[]>(mockEvents);
  const [emails, setEmails] = useState<Email[]>(mockEmails);
  const [meetings, setMeetings] = useState<Meeting[]>(mockMeetings);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // In a real implementation, this would call Google APIs
  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // For now, just refresh the mock data with slight variations
      setEvents([...mockEvents]);
      setEmails([...mockEmails]);
      setMeetings([...mockMeetings]);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      refreshData().catch(console.error);
    }, 300000);
    return () => clearInterval(interval);
  }, [refreshData]);

  return {
    events,
    emails,
    meetings,
    loading,
    error,
    refreshData,
  };
}
