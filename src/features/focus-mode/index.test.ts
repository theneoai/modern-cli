import { describe, it, expect } from 'vitest';
import { FocusMode } from './index.js';

describe('FocusMode', () => {
  it('should start a pomodoro session', async () => {
    const fm = new FocusMode({ enabled: true });
    const session = await fm.startFocusSession('pomodoro');
    expect(session.type).toBe('pomodoro');
    expect(session.status).toBe('running');
  });
  
  it('should track interruptions', async () => {
    const fm = new FocusMode({ enabled: true });
    await fm.startFocusSession();
    fm.interruptSession('Test interruption');
    const stats = fm.getStats();
    expect(stats.avgInterruptions).toBeGreaterThan(0);
  });
  
  it('should calculate stats', async () => {
    const fm = new FocusMode({ enabled: true });
    await fm.startFocusSession();
    fm.completeSession(fm['sessions'][0].id);
    const stats = fm.getStats();
    expect(stats.totalSessions).toBe(1);
  });
});
