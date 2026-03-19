import { describe, it, expect } from 'vitest';
import { AutoNotes } from './index.js';

describe('AutoNotes', () => {
  it('should generate notes from transcript', async () => {
    const an = new AutoNotes({ enabled: true });
    const note = await an.generateNotes({
      meetingId: 'm1',
      title: 'Test Meeting',
      transcript: 'We decided to launch next week. Action item: Update the website.',
      participants: ['Alice', 'Bob'],
    });
    
    expect(note.title).toBe('Test Meeting');
    expect(note.decisions.length).toBeGreaterThan(0);
    expect(note.actionItems.length).toBeGreaterThan(0);
  });
  
  it('should search notes', async () => {
    const an = new AutoNotes({ enabled: true });
    await an.generateNotes({
      meetingId: 'm1',
      title: 'Product Meeting',
      transcript: 'We need to improve the UX.',
      participants: ['Alice'],
    });
    
    const results = an.searchNotes('product');
    expect(results.length).toBeGreaterThan(0);
  });
});
