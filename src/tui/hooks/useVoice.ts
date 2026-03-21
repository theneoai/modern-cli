/**
 * useVoice — React hook that syncs voiceEngine singleton state into React.
 *
 * Returns { enabled, playing } and polls `isPlaying` at 500ms so that
 * the UI reflects the actual playback state without requiring event emitters.
 */

import { useState, useEffect } from 'react';
import { voiceEngine } from '../companion/voice/VoiceEngine.js';

export interface VoiceState {
  enabled: boolean;
  playing: boolean;
}

export function useVoice(): VoiceState {
  const [enabled, setEnabled] = useState(() => voiceEngine.isEnabled);
  const [playing, setPlaying] = useState(false);

  // Poll playing state every 500ms (cheap boolean check)
  useEffect(() => {
    const t = setInterval(() => {
      setPlaying(prev => {
        const cur = voiceEngine.isPlaying;
        return prev !== cur ? cur : prev;
      });
      setEnabled(prev => {
        const cur = voiceEngine.isEnabled;
        return prev !== cur ? cur : prev;
      });
    }, 500);
    return () => clearInterval(t);
  }, []);

  return { enabled, playing };
}
