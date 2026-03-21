/**
 * useIntel — React hook that initializes the intel engine and surfaces
 * high-priority items as React state.
 *
 * Responsibilities extracted from FlowApp:
 *   - Init intelEngine once with callback
 *   - Track unread badge count
 *   - Return hot items (score ≥ 80) for main chat surfacing
 */

import { useState, useEffect, useRef } from 'react';
import { intelEngine, type IntelItem } from '../intel/IntelEngine.js';

export interface IntelState {
  unreadCount: number;
  clearUnread: () => void;
  /** High-priority items (score ≥ 80) pushed since last read */
  hotItems: IntelItem[];
  clearHot: () => void;
}

export function useIntel(): IntelState {
  const [unreadCount, setUnreadCount] = useState(0);
  const [hotItems, setHotItems] = useState<IntelItem[]>([]);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) {
      // Re-mount: update callback without re-initializing scheduler
      intelEngine.setOnNewItems((items) => {
        setUnreadCount(prev => prev + items.length);
        const hot = items.filter(i => i.score >= 80);
        if (hot.length > 0) setHotItems(prev => [...prev, ...hot]);
      });
      return;
    }
    initialized.current = true;

    intelEngine.init({}, (items) => {
      setUnreadCount(prev => prev + items.length);
      const hot = items.filter(i => i.score >= 80);
      if (hot.length > 0) setHotItems(prev => [...prev, ...hot]);
    });

    return () => intelEngine.destroy();
  }, []);

  return {
    unreadCount,
    clearUnread: () => setUnreadCount(0),
    hotItems,
    clearHot: () => setHotItems([]),
  };
}
