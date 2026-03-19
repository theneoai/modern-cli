import { useCallback, useState } from 'react';
import type { Task } from './useTasks.js';
import type { Message } from '../App.js';
import { icons } from '../../theme/index.js';

interface CommandContext {
  addTask: (task: Partial<Task>) => Task;
  updateTask: (id: string, updates: Partial<Task>) => void;
  completeTask: (id: string) => void;
  deleteTask: (id: string) => void;
  refreshData: () => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  exit: () => void;
  showToast?: (type: 'success' | 'error' | 'warning' | 'info', content: string) => void;
}

interface CommandResult {
  success: boolean;
  message?: string;
}

interface Command {
  name: string;
  description: string;
  usage?: string;
  category: 'navigation' | 'tasks' | 'google' | 'agents' | 'orgs';
}

const commands: Command[] = [
  // Navigation
  { name: 'help', description: 'Show this help', usage: '/help [page]', category: 'navigation' },
  { name: 'exit', description: 'Exit HyperTerminal', usage: '/exit', category: 'navigation' },
  { name: 'quit', description: 'Exit HyperTerminal', usage: '/quit', category: 'navigation' },
  { name: 'clear', description: 'Clear screen', usage: '/clear', category: 'navigation' },
  
  // Tasks
  { name: 'tasks', description: 'Show all tasks', usage: '/tasks', category: 'tasks' },
  { name: 'task', description: 'Manage tasks', usage: '/task add <title> | /task done <id>', category: 'tasks' },
  
  // Google Integration
  { name: 'calendar', description: 'Show full calendar', usage: '/calendar', category: 'google' },
  { name: 'emails', description: 'Show all emails', usage: '/emails', category: 'google' },
  { name: 'meetings', description: 'Show all meetings', usage: '/meetings', category: 'google' },
  { name: 'refresh', description: 'Sync with Google', usage: '/refresh', category: 'google' },
  
  // Agents
  { name: 'agents', description: 'List all agents', usage: '/agents', category: 'agents' },
  { name: 'agent', description: 'Show agent details', usage: '/agent <name>', category: 'agents' },
  
  // Organizations
  { name: 'orgs', description: 'List organizations', usage: '/orgs', category: 'orgs' },
  { name: 'org', description: 'Show org details', usage: '/org <id>', category: 'orgs' },
];

const HELP_PAGE_SIZE = 8;

function formatHelpPage(page: number): { content: string; hasMore: boolean; totalPages: number } {
  const totalPages = Math.ceil(commands.length / HELP_PAGE_SIZE);
  const start = (page - 1) * HELP_PAGE_SIZE;
  const end = Math.min(start + HELP_PAGE_SIZE, commands.length);
  const pageCommands = commands.slice(start, end);
  
  const categories = ['navigation', 'tasks', 'google', 'agents', 'orgs'] as const;
  const categoryIcons: Record<string, string> = {
    navigation: icons.arrow,
    tasks: icons.check,
    google: icons.calendar,
    agents: icons.agent,
    orgs: icons.building,
  };
  
  const categoryLabels: Record<string, string> = {
    navigation: 'Navigation',
    tasks: 'Tasks',
    google: 'Google Integration',
    agents: 'Agents',
    orgs: 'Organizations',
  };
  
  let content = `\n${icons.sparkle} Available Commands (Page ${page}/${totalPages})\n`;
  content += '═'.repeat(50) + '\n\n';
  
  for (const category of categories) {
    const categoryCommands = pageCommands.filter(c => c.category === category);
    if (categoryCommands.length === 0) continue;
    
    content += `${categoryIcons[category]} ${categoryLabels[category]}\n`;
    for (const cmd of categoryCommands) {
      content += `  /${cmd.name.padEnd(12)} ${cmd.description}\n`;
      if (cmd.usage && cmd.usage !== `/${cmd.name}`) {
        content += `              ${cmd.usage}\n`;
      }
    }
    content += '\n';
  }
  
  content += '─'.repeat(50) + '\n';
  content += 'Type "/help <page>" for more commands\n';
  content += 'Natural language: "Add buy milk" | "Done buy milk"\n';
  
  return {
    content,
    hasMore: end < commands.length,
    totalPages,
  };
}

export function useCommandParser() {
  const [helpPage, setHelpPage] = useState(1);

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
      case 'help': {
        const requestedPage = args[0] ? parseInt(args[0], 10) : helpPage;
        const page = isNaN(requestedPage) ? 1 : Math.max(1, requestedPage);
        const { content, totalPages } = formatHelpPage(page);
        setHelpPage(page < totalPages ? page + 1 : 1);
        return {
          success: true,
          message: content,
        };
      }

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

      case 'task': {
        const subCommand = args[0];
        const title = args.slice(1).join(' ');
        
        if (subCommand === 'add' && title) {
          const task = context.addTask({ title });
          return { success: true, message: `Created task: ${task.title}` };
        }
        if (subCommand === 'done' && title) {
          return { success: true, message: 'Use "done <task-name>" or press C on a selected task' };
        }
        return { success: false, message: 'Usage: /task add <title> or /task done <id>' };
      }

      case 'calendar':
        return {
          success: true,
          message: `${icons.calendar} Calendar view - Use the sidebar (press 1) for now.`,
        };

      case 'emails':
        return {
          success: true,
          message: `${icons.email} Email view - Use the sidebar (press 2) for now.`,
        };

      case 'meetings':
        return {
          success: true,
          message: `${icons.meeting} Meetings view - Use the sidebar (press 3) for now.`,
        };

      case 'refresh':
        await context.refreshData();
        return { success: true, message: 'Data refreshed' };

      case 'agents': {
        const agentList = [
          `${icons.agent} Researcher - Analyzes requirements`,
          `${icons.agent} Planner - Breaks down tasks`,
          `${icons.agent} Coder - Writes code`,
          `${icons.agent} Reviewer - Reviews work`,
          `${icons.agent} Synthesizer - Combines outputs`,
        ].join('\n  ');
        return {
          success: true,
          message: `Available agents:\n  ${agentList}\n\nType "/agent <name>" for details`,
        };
      }

      case 'agent': {
        const agentName = args[0];
        if (agentName) {
          return {
            success: true,
            message: `Agent: ${agentName}\nUse "hyper agent run ${agentName} '<task>'" to execute.`,
          };
        }
        return { success: false, message: 'Usage: /agent <name>' };
      }

      case 'orgs':
        return {
          success: true,
          message: `${icons.building} Organizations: Use "hyper org list" to view.`,
        };

      case 'org': {
        const orgId = args[0];
        if (orgId) {
          return {
            success: true,
            message: `${icons.building} Organization: ${orgId}`,
          };
        }
        return { success: false, message: 'Usage: /org <id>' };
      }

      default:
        return {
          success: false,
          message: `Unknown command: /${command}\nType /help for available commands.`,
        };
    }
  }, [helpPage, parseCommand]);

  return {
    parseCommand,
    executeCommand,
  };
}
