/**
 * Event Bus - Central event system for HyperTerminal
 * 
 * Enables decoupled communication between:
 * - Agents
 * - Workflows
 * - UI components
 * - External integrations
 */

import EventEmitter from 'eventemitter3';

// Global event emitter instance
const eventBus = new EventEmitter();

// Core event types
export interface HyperEvents {
  // Agent lifecycle
  'agent.created': { agentId: string; name: string; role: string };
  'agent.updated': { agentId: string; changes: Record<string, any> };
  'agent.deleted': { agentId: string };
  'agent.state.changed': { agentId: string; from: string; to: string; reason?: string };
  'agent.message.sent': { agentId: string; message: string; target?: string };
  'agent.message.received': { agentId: string; message: string; from?: string };
  'agent.task.assigned': { agentId: string; taskId: string };
  'agent.task.completed': { agentId: string; taskId: string; result: any };
  'agent.error': { agentId: string; error: string; context?: any };

  // Organization events
  'org.created': { orgId: string; name: string; type: string };
  'org.member.joined': { orgId: string; agentId: string; role: string };
  'org.member.left': { orgId: string; agentId: string };
  'org.hierarchy.changed': { orgId: string; changes: any };

  // Social events
  'social.relation.formed': { from: string; to: string; type: string; strength: number };
  'social.relation.changed': { from: string; to: string; type: string; oldStrength: number; newStrength: number };
  'social.interaction': { participants: string[]; type: string; outcome: any };

  // Workflow events
  'workflow.created': { workflowId: string; name: string };
  'workflow.triggered': { workflowId: string; runId: string; context: any };
  'workflow.step.started': { workflowId: string; runId: string; stepId: string; agentId?: string };
  'workflow.step.completed': { workflowId: string; runId: string; stepId: string; result: any };
  'workflow.completed': { workflowId: string; runId: string; result: any; duration: number };
  'workflow.failed': { workflowId: string; runId: string; error: string };

  // Task events
  'task.created': { taskId: string; title: string; assigneeId?: string; priority: number };
  'task.status.changed': { taskId: string; from: string; to: string };
  'task.progress': { taskId: string; progress: number; message?: string };

  // Memory events
  'memory.created': { memoryId: string; agentId: string; type: string; importance: number };
  'memory.accessed': { memoryId: string; agentId: string };
  'memory.consolidated': { agentId: string; count: number };

  // Economy events
  'economy.transaction': { txId: string; from: string; to: string; amount: number; type: string };
  'economy.salary': { agentId: string; orgId: string; amount: number };
  'economy.budget.changed': { orgId: string; department?: string; oldValue: number; newValue: number };

  // UI events
  'ui.command': { command: string; args: string[] };
  'ui.mode.changed': { from: string; to: string };
  'ui.focus.changed': { component: string };
  'ui.notification': { type: 'info' | 'success' | 'warning' | 'error'; message: string };

  // System events
  'system.startup': { version: string; config: any };
  'system.shutdown': { reason?: string };
  'system.error': { error: string; stack?: string };
  'system.config.changed': { key: string; oldValue: any; newValue: any };

  // Plugin events
  'plugin.installed': { pluginId: string; name: string; version: string };
  'plugin.enabled': { pluginId: string };
  'plugin.disabled': { pluginId: string };
  'plugin.uninstalled': { pluginId: string };
}

// Type-safe event emitter wrapper
class TypedEventBus {
  emit<K extends keyof HyperEvents>(event: K, data: HyperEvents[K]): boolean {
    return eventBus.emit(event, data);
  }

  on<K extends keyof HyperEvents>(event: K, handler: (data: HyperEvents[K]) => void): () => void {
    eventBus.on(event, handler);
    return () => eventBus.off(event, handler);
  }

  once<K extends keyof HyperEvents>(event: K, handler: (data: HyperEvents[K]) => void): void {
    eventBus.once(event, handler);
  }

  off<K extends keyof HyperEvents>(event: K, handler: (data: HyperEvents[K]) => void): void {
    eventBus.off(event, handler);
  }

  // Pattern matching for wildcard events
  onPattern(pattern: string | RegExp, handler: (event: string, data: any) => void): () => void {
    const wrapper = (event: string, data: any) => {
      if (typeof pattern === 'string') {
        if (event.startsWith(pattern) || event === pattern) {
          handler(event, data);
        }
      } else if (pattern.test(event)) {
        handler(event, data);
      }
    };
    eventBus.on('*', wrapper as any);
    return () => eventBus.off('*', wrapper as any);
  }

  // Wait for a specific event (async)
  waitFor<K extends keyof HyperEvents>(
    event: K,
    timeout?: number,
    predicate?: (data: HyperEvents[K]) => boolean
  ): Promise<HyperEvents[K]> {
    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;

      const handler = (data: HyperEvents[K]) => {
        if (predicate && !predicate(data)) return;
        
        if (timer) clearTimeout(timer);
        this.off(event, handler);
        resolve(data);
      };

      this.on(event, handler);

      if (timeout) {
        timer = setTimeout(() => {
          this.off(event, handler);
          reject(new Error(`Timeout waiting for event: ${event}`));
        }, timeout);
      }
    });
  }

  // Remove all listeners
  removeAllListeners(event?: keyof HyperEvents): void {
    if (event) {
      eventBus.removeAllListeners(event);
    } else {
      eventBus.removeAllListeners();
    }
  }

  // Debug: list all listeners
  listenerCount(event: keyof HyperEvents): number {
    return eventBus.listenerCount(event);
  }
}

// Export singleton
export const events = new TypedEventBus();

// Logger middleware (optional)
let loggingEnabled = false;

export function enableEventLogging(enabled: boolean = true): void {
  loggingEnabled = enabled;
}

// Auto-log all events when enabled
eventBus.on('*', (event: string, data: any) => {
  if (loggingEnabled && event !== '*') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Event: ${event}`, JSON.stringify(data, null, 2));
  }
});

// Event history for debugging
const eventHistory: Array<{ timestamp: Date; event: string; data: any }> = [];
const MAX_HISTORY = 1000;

export function enableEventHistory(): void {
  eventBus.on('*', (event: string, data: any) => {
    if (event !== '*') {
      eventHistory.push({ timestamp: new Date(), event, data });
      if (eventHistory.length > MAX_HISTORY) {
        eventHistory.shift();
      }
    }
  });
}

export function getEventHistory(filter?: string | RegExp): typeof eventHistory {
  if (!filter) return [...eventHistory];
  
  if (typeof filter === 'string') {
    return eventHistory.filter(e => e.event === filter || e.event.startsWith(filter));
  }
  
  return eventHistory.filter(e => filter.test(e.event));
}

export function clearEventHistory(): void {
  eventHistory.length = 0;
}
