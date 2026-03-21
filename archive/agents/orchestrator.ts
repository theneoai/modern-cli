/**
 * Multi-Agent Orchestrator - Coordinates multiple agents to work together
 */

import { v4 as uuidv4 } from 'uuid';
import { getAgent, executeAgent } from './engine/index.js';
import { addMemory, getMemories } from '../memory/store.js';
import { events } from '../core/events/index.js';
// import { executeSkill } from '../skills/registry.js';
import type { Agent } from '../types/index.js';

export interface OrchestrationPlan {
  id: string;
  goal: string;
  steps: OrchestrationStep[];
  assignees: string[];
}

export interface OrchestrationStep {
  id: string;
  description: string;
  agentId: string;
  dependencies: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
}

export async function createOrchestration(
  goal: string,
  agentIds: string[],
  strategy: 'sequential' | 'parallel' | 'hierarchical' = 'sequential'
): Promise<OrchestrationPlan> {
  const agents = agentIds.map(id => getAgent(id)).filter(Boolean) as Agent[];
  
  if (agents.length === 0) {
    throw new Error('No valid agents provided');
  }

  const plan: OrchestrationPlan = {
    id: uuidv4(),
    goal,
    steps: [],
    assignees: agentIds,
  };

  // Create steps based on strategy
  switch (strategy) {
    case 'sequential':
      // Each agent does one step
      for (let i = 0; i < agents.length; i++) {
        plan.steps.push({
          id: `step-${i}`,
          description: `${agents[i].role}: ${getRoleTask(agents[i].role, goal)}`,
          agentId: agents[i].id,
          dependencies: i > 0 ? [`step-${i-1}`] : [],
          status: 'pending',
        });
      }
      break;

    case 'parallel':
      // All agents work on different aspects simultaneously
      const aspects = ['research', 'plan', 'implement', 'review'];
      for (let i = 0; i < Math.min(agents.length, aspects.length); i++) {
        plan.steps.push({
          id: `step-${aspects[i]}`,
          description: `${agents[i].role}: ${aspects[i]} ${goal}`,
          agentId: agents[i].id,
          dependencies: [],
          status: 'pending',
        });
      }
      break;

    case 'hierarchical':
      // Manager agent delegates to workers
      const manager = agents.find(a => a.role === 'planner') || agents[0];
      plan.steps.push({
        id: 'step-delegate',
        description: `${manager.role}: Plan and delegate ${goal}`,
        agentId: manager.id,
        dependencies: [],
        status: 'pending',
      });
      
      for (let i = 1; i < agents.length; i++) {
        plan.steps.push({
          id: `step-${i}`,
          description: `${agents[i].role}: Execute delegated task`,
          agentId: agents[i].id,
          dependencies: ['step-delegate'],
          status: 'pending',
        });
      }
      break;
  }

  return plan;
}

export async function executeOrchestration(
  plan: OrchestrationPlan,
  options: {
    onStepStart?: (step: OrchestrationStep) => void;
    onStepComplete?: (step: OrchestrationStep) => void;
    injectMemories?: boolean;
  } = {}
): Promise<OrchestrationPlan> {
  const completedSteps = new Set<string>();
  // const _stepMap = new Map(plan.steps.map(s => [s.id, s]));

  events.emit('orchestration.started', { planId: plan.id, goal: plan.goal });

  while (completedSteps.size < plan.steps.length) {
    // Find ready steps
    const readySteps = plan.steps.filter(s => 
      s.status === 'pending' &&
      s.dependencies.every(d => completedSteps.has(d))
    );

    if (readySteps.length === 0 && completedSteps.size < plan.steps.length) {
      throw new Error('Deadlock detected in orchestration');
    }

    // Execute ready steps in parallel
    await Promise.all(readySteps.map(async step => {
      step.status = 'running';
      options.onStepStart?.(step);

      try {
        const agent = getAgent(step.agentId);
        if (!agent) throw new Error(`Agent ${step.agentId} not found`);

        // Inject relevant memories
        let prompt = step.description;
        if (options.injectMemories) {
          const memories = getMemories({ agentId: agent.id, limit: 5 });
          if (memories.length > 0) {
            prompt = `Context from previous work:\n${memories.map(m => m.content).join('\n')}\n\nTask: ${step.description}`;
          }
        }

        // Execute agent
        const result = await executeAgent(agent.id, prompt);
        step.result = result.output;
        step.status = 'completed';
        completedSteps.add(step.id);

        // Save to memory
        addMemory(agent.id, result.output, 'episodic', {
          importance: 7,
          tags: ['orchestration', plan.id],
          metadata: { planId: plan.id, stepId: step.id },
        });

        options.onStepComplete?.(step);

        events.emit('orchestration.step.completed', {
          planId: plan.id,
          stepId: step.id,
          agentId: agent.id,
        });

      } catch (error) {
        step.status = 'failed';
        events.emit('orchestration.step.failed', {
          planId: plan.id,
          stepId: step.id,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }));
  }

  events.emit('orchestration.completed', { planId: plan.id });
  return plan;
}

export async function autoOrchestrate(
  goal: string,
  options: {
    maxAgents?: number;
    strategy?: 'sequential' | 'parallel' | 'hierarchical';
  } = {}
): Promise<{ plan: OrchestrationPlan; summary: string }> {
  // Auto-select agents based on goal
  const { listAgents } = await import('./engine/index.js');
  const allAgents = listAgents();
  
  // Simple heuristic: select diverse roles
  const selectedAgents = allAgents
    .filter(a => a.state.status === 'idle')
    .slice(0, options.maxAgents || 3);

  if (selectedAgents.length === 0) {
    throw new Error('No idle agents available');
  }

  const plan = await createOrchestration(
    goal,
    selectedAgents.map(a => a.id),
    options.strategy || 'sequential'
  );

  const summary = `Orchestration plan created:\n` +
    `Goal: ${goal}\n` +
    `Agents: ${selectedAgents.map(a => a.name).join(', ')}\n` +
    `Steps: ${plan.steps.length}\n` +
    `Strategy: ${options.strategy || 'sequential'}`;

  return { plan, summary };
}

function getRoleTask(role: string, goal: string): string {
  const tasks: Record<string, string> = {
    researcher: `Research and analyze requirements for: ${goal}`,
    planner: `Create detailed plan for: ${goal}`,
    coder: `Implement solution for: ${goal}`,
    reviewer: `Review and validate: ${goal}`,
    synthesizer: `Synthesize final output for: ${goal}`,
  };
  return tasks[role] || `Work on: ${goal}`;
}

// Agent meeting/conference
export async function conductMeeting(
  topic: string,
  agentIds: string[],
  options: {
    rounds?: number;
    moderatorId?: string;
  } = {}
): Promise<{ transcript: string[]; conclusion: string }> {
  const transcript: string[] = [];
  const agents = agentIds.map(id => getAgent(id)).filter(Boolean) as Agent[];
  
  if (agents.length === 0) throw new Error('No valid agents for meeting');

  const moderator = options.moderatorId 
    ? getAgent(options.moderatorId) 
    : (agents.find(a => a.role === 'planner') ?? agents[0]);

  transcript.push(`[Moderator ${moderator?.name}] Welcome to the meeting on: ${topic}`);

  for (let round = 0; round < (options.rounds || 2); round++) {
    transcript.push(`\n--- Round ${round + 1} ---`);
    
    for (const agent of agents) {
      const context = transcript.slice(-5).join('\n');
      const prompt = `Meeting on "${topic}". Previous discussion:\n${context}\n\nAs ${agent.role}, share your perspective (2-3 sentences):`;
      
      const result = await executeAgent(agent.id, prompt);
      transcript.push(`[${agent.name}] ${result.output}`);
    }
  }

  // Synthesize conclusion
  const synthesizer = agents.find(a => a.role === 'synthesizer') || agents[0];
  const synthesisPrompt = `Based on this meeting transcript, provide a brief conclusion:\n${transcript.slice(-10).join('\n')}`;
  const conclusion = (await executeAgent(synthesizer.id, synthesisPrompt)).output;

  transcript.push(`\n[Conclusion] ${conclusion}`);

  // Save meeting to all participants' memories
  for (const agent of agents) {
    addMemory(agent.id, `Meeting on ${topic}: ${conclusion}`, 'episodic', {
      importance: 6,
      tags: ['meeting', 'collaboration'],
    });
  }

  return { transcript, conclusion };
}
