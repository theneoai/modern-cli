import { useState, useEffect, useCallback } from 'react';
import type { CalendarEvent, Email, Meeting } from '../../types/ui.js';

interface UseGoogleDataReturn {
  events: CalendarEvent[];
  emails: Email[];
  meetings: Meeting[];
  loading: boolean;
  error: Error | null;
  refreshData: () => Promise<void>;
}

/**
 * Hook to manage Google data (calendar, emails, meetings)
 * Currently uses mock data with simulated loading
 */
export function useGoogleData(): UseGoogleDataReturn {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Mock data
      const now = new Date();
      
      setEvents([
        {
          id: '1',
          title: 'Team Standup',
          startTime: new Date(now.getTime() + 3600000),
          endTime: new Date(now.getTime() + 3600000 + 1800000),
          type: 'event',
        },
        {
          id: '2',
          title: 'Project Review',
          startTime: new Date(now.getTime() + 7200000),
          endTime: new Date(now.getTime() + 7200000 + 3600000),
          type: 'event',
        },
        {
          id: '3',
          title: 'Lunch Break',
          startTime: new Date(now.getTime() + 14400000),
          type: 'reminder',
        },
      ]);
      
      setEmails([
        {
          id: '1',
          subject: 'Q4 Planning Meeting',
          from: 'manager@company.com',
          preview: 'Let\'s discuss our goals for Q4...',
          read: false,
          receivedAt: new Date(now.getTime() - 3600000),
          priority: 'high',
        },
        {
          id: '2',
          subject: 'Code Review Request',
          from: 'teammate@company.com',
          preview: 'Can you review my PR?',
          read: false,
          receivedAt: new Date(now.getTime() - 7200000),
          priority: 'normal',
        },
        {
          id: '3',
          subject: 'Weekly Newsletter',
          from: 'newsletter@tech.com',
          preview: 'Top stories this week...',
          read: true,
          receivedAt: new Date(now.getTime() - 86400000),
          priority: 'low',
        },
      ]);
      
      setMeetings([
        {
          id: '1',
          title: 'Product Sync',
          time: new Date(now.getTime() + 3600000),
          duration: 30,
          attendees: 5,
          link: 'https://meet.example.com/123',
        },
        {
          id: '2',
          title: 'Design Review',
          time: new Date(now.getTime() + 10800000),
          duration: 60,
          attendees: 8,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load data'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    events,
    emails,
    meetings,
    loading,
    error,
    refreshData: loadData,
  };
}
