import { useCallback } from 'react';
import type { Task } from './useTasks.js';
import type { Message } from '../App.js';

interface CommandContext {
  addTask: (task: Partial<Task>) => Task;
  updateTask: (id: string, updates: Partial<Task>) => void;
  completeTask: (id: string) => void;
  deleteTask: (id: string) => void;
  refreshData: () => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  exit: () => void;
}

interface CommandResult {
  success: boolean;
  message?: string;
}

export function useCommandParser() {
  const parseCommand = useCallback((input: string): { command: string; args: string[] } => {
    const parts = input.slice(1).split(' ');
    return {
      command: parts[0],
      args: parts.slice(1),
    };
  }, []);

  const executeCommand = useCallback(async (
    input: string,
    context: CommandContext
  ): Promise<CommandResult> => {
    const { command, args } = parseCommand(input);

    switch (command) {
      case 'help':
        return {
          success: true,
          message: `
📚 Available Commands:

Navigation:
  /help              Show this help
  /exit, /quit       Exit HyperTerminal
  /clear             Clear screen

Tasks:
  /tasks             Show all tasks
  /task add <title>  Create new task
  /task done <id>    Mark task as done
  /task delete <id>  Delete task

Google Integration:
  /calendar          Show full calendar
  /emails            Show all emails
  /meetings          Show all meetings
  /refresh           Sync with Google

Agents:
  /agents            List all agents
  /agent <id>        Show agent details

Organizations:
  /orgs              List organizations
  /org <id>          Show org details

Examples:
  "Add buy milk"     Create task
  "Done buy milk"    Complete task
          `,
        };

      case 'exit':
      case 'quit':
        context.exit();
        return { success: true };

      case 'clear':
        context.setMessages([]);
        return { success: true, message: 'Screen cleared' };

      case 'tasks':
        return {
          success: true,
          message: 'Use the task panel at the bottom or type "add <task>"',
        };

      case 'task':
        const subCommand = args[0];
        const title = args.slice(1).join(' ');
        
        if (subCommand === 'add' && title) {
          const task = context.addTask({ title });
          return { success: true, message: `Created task: ${task.title}` };
        }
        return { success: false, message: 'Usage: /task add <title>' };

      case 'calendar':
        return {
          success: true,
          message: '📅 Calendar view coming soon! Use the sidebar for now.',
        };

      case 'emails':
        return {
          success: true,
          message: '✉️ Email view coming soon! Use the sidebar for now.',
        };

      case 'meetings':
        return {
          success: true,
          message: '📹 Meetings view coming soon! Use the sidebar for now.',
        };

      case 'refresh':
        await context.refreshData();
        return { success: true, message: '🔄 Data refreshed' };

      case 'agents':
        return {
          success: true,
          message: `🤖 Available agents:
  • Researcher (🔍) - Analyzes requirements
  • Planner (📋) - Breaks down tasks
  • Coder (💻) - Writes code
  • Reviewer (🔎) - Reviews work
  • Synthesizer (✨) - Combines outputs

Type "/agent <name>" for details`,
        };

      case 'agent':
        const agentName = args[0];
        if (agentName) {
          return {
            success: true,
            message: `🤖 Agent: ${agentName}\nUse "hyper agent run ${agentName} '<task>'" to execute.`,
          };
        }
        return { success: false, message: 'Usage: /agent <name>' };

      case 'orgs':
        return {
          success: true,
          message: '🏢 Organizations: Use "hyper org list" to view.',
        };

      case 'org':
        const orgId = args[0];
        if (orgId) {
          return {
            success: true,
            message: `🏢 Organization: ${orgId}`,
          };
        }
        return { success: false, message: 'Usage: /org <id>' };

      default:
        return {
          success: false,
          message: `Unknown command: /${command}\nType /help for available commands.`,
        };
    }
  }, [parseCommand]);

  return {
    parseCommand,
    executeCommand,
  };
}
