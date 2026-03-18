/**
 * HyperTerminal - 面向未来的超级终端
 * Main entry point
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig, getConfigPath } from './core/config/index.js';
import { getDB, closeDB } from './core/db/index.js';
// import { events } from './core/events/index.js';
import { createAgent, listAgents, getAgent, deleteAgent, executeAgent, getTemplates } from './agents/engine/index.js';
// import { v4 as uuidv4 } from 'uuid';

const program = new Command();

program
  .name('hyper')
  .description('面向未来的超级终端 - AI 原生的个人操作系统')
  .version('0.2.0');

// Initialize command
program
  .command('init')
  .description('Initialize HyperTerminal')
  .action(async () => {
    console.log(chalk.cyan('🚀 Initializing HyperTerminal...'));
    
    // Ensure DB is initialized
    getDB();
    
    console.log(chalk.green('✓ Database initialized'));
    console.log(chalk.gray(`  Config path: ${getConfigPath()}`));
    
    // Create default agents if none exist
    const agents = listAgents();
    if (agents.length === 0) {
      console.log(chalk.cyan('\nCreating default agents...'));
      
      const templates = getTemplates();
      for (const template of templates) {
        createAgent({
          name: template.name,
          role: template.role,
          description: template.description,
          icon: template.icon,
          config: template.config as any,
        });
        console.log(chalk.green(`  ✓ Created ${template.icon} ${template.name}`));
      }
    }
    
    console.log(chalk.green('\n✨ HyperTerminal is ready!'));
    console.log(chalk.gray('\nTry: hyper agent list'));
  });

// Agent commands
const agentCmd = program
  .command('agent')
  .description('Manage AI agents');

agentCmd
  .command('list')
  .alias('ls')
  .description('List all agents')
  .option('-r, --role <role>', 'Filter by role')
  .action((opts) => {
    const agents = listAgents(opts.role ? { role: opts.role } : undefined);
    
    if (agents.length === 0) {
      console.log(chalk.yellow('No agents found. Run: hyper init'));
      return;
    }
    
    console.log(chalk.cyan('\n🤖 Agents:'));
    console.log(chalk.gray('─'.repeat(60)));
    
    for (const agent of agents) {
      const statusColor = {
        idle: chalk.gray,
        working: chalk.yellow,
        thinking: chalk.blue,
        meeting: chalk.magenta,
        resting: chalk.gray,
        error: chalk.red,
      }[agent.state.status] || chalk.white;
      
      console.log(`${agent.icon} ${chalk.bold(agent.name)} ${chalk.gray(`(${agent.role})`)}`);
      console.log(`   Status: ${statusColor(agent.state.status)} | Energy: ${agent.state.energy}% | Tasks: ${agent.metrics.tasksCompleted}`);
      if (agent.description) {
        console.log(`   ${chalk.gray(agent.description)}`);
      }
      console.log();
    }
  });

agentCmd
  .command('create <name>')
  .description('Create a new agent')
  .option('-r, --role <role>', 'Agent role', 'custom')
  .option('-d, --description <desc>', 'Description')
  .option('-i, --icon <icon>', 'Icon emoji', '🤖')
  .option('-t, --template <template>', 'Use template')
  .action((name, opts) => {
    const agent = createAgent({
      name,
      role: opts.role,
      description: opts.description,
      icon: opts.icon,
    });
    
    console.log(chalk.green(`✓ Created agent: ${agent.icon} ${agent.name}`));
    console.log(chalk.gray(`  ID: ${agent.id}`));
    console.log(chalk.gray(`  Role: ${agent.role}`));
  });

agentCmd
  .command('run <agent-id> <task...>')
  .description('Execute a task with an agent')
  // .option('-s, --stream', 'Stream output', false)
  .action(async (agentId, taskWords) => {
    const task = taskWords.join(' ');
    const agent = getAgent(agentId);
    
    if (!agent) {
      console.error(chalk.red(`Agent not found: ${agentId}`));
      process.exit(1);
    }
    
    console.log(chalk.cyan(`\n${agent.icon} ${agent.name} is working...`));
    console.log(chalk.gray(`Task: ${task}\n`));
    
    try {
      const startTime = Date.now();
      const result = await executeAgent(agentId, task);
      const duration = Date.now() - startTime;
      
      console.log('\n' + chalk.cyan('─'.repeat(60)));
      console.log(result.output);
      console.log(chalk.cyan('─'.repeat(60)));
      console.log(chalk.gray(`\n⏱️  ${duration}ms | 🔤 ${result.tokensUsed} tokens`));
      
    } catch (error) {
      console.error(chalk.red(`\n✗ Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

agentCmd
  .command('delete <agent-id>')
  .alias('rm')
  .description('Delete an agent')
  .action((agentId) => {
    const agent = getAgent(agentId);
    if (!agent) {
      console.error(chalk.red(`Agent not found: ${agentId}`));
      process.exit(1);
    }
    
    deleteAgent(agentId);
    console.log(chalk.green(`✓ Deleted agent: ${agent.name}`));
  });

agentCmd
  .command('templates')
  .description('List available agent templates')
  .action(() => {
    const templates = getTemplates();
    
    console.log(chalk.cyan('\n📋 Agent Templates:'));
    console.log(chalk.gray('─'.repeat(60)));
    
    for (const template of templates) {
      console.log(`${template.icon} ${chalk.bold(template.name)} ${chalk.gray(`(${template.id})`)}`);
      console.log(`   ${chalk.gray(template.description)}`);
      console.log(`   Skills: ${template.defaultSkills.join(', ')}`);
      console.log();
    }
  });

// Organization commands
const orgCmd = program
  .command('org')
  .description('Manage organizations');

orgCmd
  .command('list')
  .alias('ls')
  .description('List all organizations')
  .action(() => {
    const orgs = listOrganizations();
    
    if (orgs.length === 0) {
      console.log(chalk.yellow('No organizations found.'));
      return;
    }
    
    console.log(chalk.cyan('\n🏢 Organizations:'));
    console.log(chalk.gray('─'.repeat(60)));
    
    for (const org of orgs) {
      const icon = org.type === 'company' ? '🏢' : org.type === 'team' ? '👥' : org.type === 'town' ? '🏘️' : '🌐';
      console.log(`${icon} ${chalk.bold(org.name)} ${chalk.gray(`(${org.type})`)}`);
      console.log(`   ID: ${org.id.slice(0, 8)}`);
      if (org.description) console.log(`   ${chalk.gray(org.description)}`);
      console.log(`   💰 Budget: ${org.economy.budget} ${org.economy.currency}`);
      console.log();
    }
  });

orgCmd
  .command('create <name>')
  .description('Create a new organization')
  .option('-t, --type <type>', 'Organization type', 'company')
  .option('-d, --description <desc>', 'Description')
  .action((name, opts) => {
    const org = createOrganization({
      name,
      type: opts.type as any,
      description: opts.description,
    });
    
    console.log(chalk.green(`✓ Created organization: ${org.name}`));
    console.log(chalk.gray(`  ID: ${org.id}`));
    console.log(chalk.gray(`  Type: ${org.type}`));
  });

orgCmd
  .command('show <id>')
  .description('Show organization details')
  .action((id) => {
    const org = getOrganization(id);
    if (!org) {
      console.error(chalk.red(`Organization not found: ${id}`));
      process.exit(1);
    }
    
    console.log(chalk.cyan(`\n🏢 ${org.name}`));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(`ID: ${org.id}`);
    console.log(`Type: ${org.type}`);
    console.log(`Description: ${org.description || 'N/A'}`);
    console.log(`\nEconomy:`);
    console.log(`  Currency: ${org.economy.currency}`);
    console.log(`  Budget: ${org.economy.budget}`);
    console.log(`  Revenue: ${org.economy.revenue}`);
    console.log(`  Expenses: ${org.economy.expenses}`);
    
    const members = getOrgMembers(org.id);
    if (members.length > 0) {
      console.log(`\nMembers (${members.length}):`);
      for (const m of members) {
        console.log(`  ${m.role || 'Member'} - Agent ${m.agentId.slice(0, 8)}`);
      }
    }
  });

orgCmd
  .command('join <org-id> <agent-id>')
  .description('Add agent to organization')
  .option('-d, --department <dept>', 'Department')
  .option('-r, --role <role>', 'Role')
  .option('--salary <amount>', 'Salary', '100')
  .action((orgId, agentId, opts) => {
    addAgentToOrg(agentId, orgId, {
      department: opts.department,
      role: opts.role,
      salary: parseInt(opts.salary),
    });
    
    console.log(chalk.green(`✓ Added agent to organization`));
  });

orgCmd
  .command('chart <id>')
  .description('Display organization chart')
  .action((id) => {
    const chart = generateOrgChart(id);
    console.log('\n' + chart);
  });

orgCmd
  .command('delete <id>')
  .alias('rm')
  .description('Delete an organization')
  .action((id) => {
    if (deleteOrganization(id)) {
      console.log(chalk.green(`✓ Deleted organization`));
    } else {
      console.error(chalk.red(`Organization not found: ${id}`));
      process.exit(1);
    }
  });

// Config commands
const configCmd = program
  .command('config')
  .description('Manage configuration');

configCmd
  .command('show')
  .description('Show current configuration')
  .action(() => {
    const config = getConfig();
    console.log(chalk.cyan('\n⚙️  Configuration:'));
    console.log(chalk.gray(JSON.stringify(config, null, 2)));
  });

configCmd
  .command('path')
  .description('Show config file path')
  .action(() => {
    console.log(getConfigPath());
  });

import { 
  createOrganization, 
  listOrganizations, 
  getOrganization, 
  deleteOrganization,
  addAgentToOrg,
  getOrgMembers,
  generateOrgChart
} from './org/index.js';

// Workflow commands
const workflowCmd = program
  .command('workflow')
  .alias('wf')
  .description('Manage workflows');

workflowCmd
  .command('list')
  .description('List all workflows')
  .action(() => {
    const { listWorkflows } = require('./workflow/engine.js');
    const workflows = listWorkflows();
    console.log(chalk.cyan('\n📊 Workflows:'));
    console.log(chalk.gray('─'.repeat(60)));
    for (const wf of workflows) {
      console.log(`${chalk.bold(wf.name)} ${chalk.gray(`(v${wf.version})`)}`);
      console.log(`  ${wf.description || 'No description'}`);
      console.log(`  Nodes: ${wf.definition.nodes.length}, Edges: ${wf.definition.edges.length}`);
      console.log();
    }
  });

workflowCmd
  .command('run <id>')
  .description('Execute a workflow')
  .action(async (id) => {
    const { getWorkflow, executeWorkflow } = await import('./workflow/engine.js');
    const { initWorkflowTables } = await import('./workflow/engine.js');
    initWorkflowTables();
    
    const workflow = getWorkflow(id);
    if (!workflow) {
      console.error(chalk.red(`Workflow not found: ${id}`));
      process.exit(1);
    }
    
    console.log(chalk.cyan(`\n▶️ Running workflow: ${workflow.name}`));
    try {
      const execution = await executeWorkflow(id);
      console.log(chalk.green(`✓ Completed in ${Date.now() - execution.startedAt.getTime()}ms`));
    } catch (error) {
      console.error(chalk.red(`✗ Failed: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// Skill commands
const skillCmd = program
  .command('skill')
  .description('Manage skills');

skillCmd
  .command('list')
  .description('List all skills')
  .action(() => {
    const { listSkills, initSkills } = require('./skills/registry.js');
    initSkills();
    const skills = listSkills();
    console.log(chalk.cyan('\n🛠️ Skills:'));
    console.log(chalk.gray('─'.repeat(60)));
    for (const skill of skills) {
      const status = skill.enabled ? chalk.green('●') : chalk.gray('○');
      console.log(`${status} ${chalk.bold(skill.name)} ${chalk.gray(skill.version)}`);
      console.log(`  ${skill.description}`);
      console.log(`  Tags: ${skill.tags.join(', ')}`);
      console.log();
    }
  });

skillCmd
  .command('exec <name>')
  .description('Execute a skill')
  .option('-i, --input <json>', 'Input as JSON', '{}')
  .action(async (name, opts) => {
    const { getSkill, executeSkill, initSkills } = await import('./skills/registry.js');
    initSkills();
    
    const skill = getSkill(name);
    if (!skill) {
      console.error(chalk.red(`Skill not found: ${name}`));
      process.exit(1);
    }
    
    try {
      const input = JSON.parse(opts.input);
      console.log(chalk.cyan(`\n▶️ Executing skill: ${skill.name}`));
      const result = await executeSkill(name, input);
      console.log(chalk.green('✓ Result:'));
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(chalk.red(`✗ Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// Memory commands
const memoryCmd = program
  .command('memory')
  .description('Manage agent memories');

memoryCmd
  .command('list [agent-id]')
  .description('List memories for an agent')
  .action((agentId) => {
    const { getMemories } = require('./memory/store.js');
    const memories = getMemories({ agentId, limit: 20 });
    console.log(chalk.cyan(`\n🧠 Memories${agentId ? ` for ${agentId.slice(0, 8)}` : ''}:`));
    console.log(chalk.gray('─'.repeat(60)));
    for (const mem of memories) {
      const icon = { episodic: '📅', semantic: '📚', procedural: '⚙️', working: '💭' }[mem.type];
      console.log(`${icon} [${mem.type}] ${chalk.bold(mem.summary?.slice(0, 40) || mem.content.slice(0, 40))}`);
      console.log(`  Importance: ${'★'.repeat(mem.importance)}${'☆'.repeat(10 - mem.importance)}`);
      console.log(`  Tags: ${mem.tags.join(', ') || 'none'}`);
      console.log();
    }
  });

// Orchestration commands
const orchCmd = program
  .command('orchestrate')
  .alias('orch')
  .description('Multi-agent orchestration');

orchCmd
  .command('run <goal>')
  .description('Auto-orchestrate agents for a goal')
  .option('-s, --strategy <strategy>', 'Strategy: sequential, parallel, hierarchical', 'sequential')
  .action(async (goal, opts) => {
    const { autoOrchestrate, executeOrchestration } = await import('./agents/orchestrator.js');
    
    console.log(chalk.cyan(`\n🎼 Orchestrating: ${goal}`));
    try {
      const { plan, summary } = await autoOrchestrate(goal, { strategy: opts.strategy });
      console.log(chalk.gray(summary));
      console.log(chalk.cyan('\n▶️ Executing...'));
      
      await executeOrchestration(plan, {
        onStepStart: (step) => console.log(chalk.gray(`  → ${step.description}`)),
        onStepComplete: (step) => console.log(chalk.green(`  ✓ ${step.description.slice(0, 50)}`)),
      });
      
      console.log(chalk.green('\n✓ Orchestration complete!'));
    } catch (error) {
      console.error(chalk.red(`✗ Failed: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// Economy commands
const economyCmd = program
  .command('economy')
  .alias('eco')
  .description('Economy and market');

economyCmd
  .command('balance <entity-type> <id>')
  .description('Check balance (agent or org)')
  .action((type, id) => {
    const { getBalance } = require('./economy/index.js');
    const balance = getBalance(id, type as any);
    console.log(chalk.cyan(`\n💰 Balance:`));
    console.log(`Entity: ${type} ${id.slice(0, 8)}`);
    console.log(`Amount: ${balance} HTC`);
  });

economyCmd
  .command('market')
  .description('View market listings')
  .action(() => {
    const { getListings } = require('./economy/index.js');
    const listings = getListings();
    console.log(chalk.cyan('\n🏪 Market:'));
    console.log(chalk.gray('─'.repeat(60)));
    for (const listing of listings) {
      console.log(`${chalk.bold(listing.service)} - ${listing.price} ${listing.currency}`);
      console.log(`  ${listing.description}`);
      console.log(`  Seller: ${listing.sellerId.slice(0, 8)}`);
      console.log();
    }
  });

// Code generation commands
const genCmd = program
  .command('generate')
  .alias('gen')
  .description('Auto-generate code');

genCmd
  .command('skill <description>')
  .description('Generate a skill from description')
  .action(async (description) => {
    const { generateSkill } = await import('./codegen/index.js');
    console.log(chalk.cyan(`\n✨ Generating skill: ${description}`));
    const result = await generateSkill(description);
    if (result.success) {
      console.log(chalk.green('\n✓ Generated code:'));
      console.log(chalk.gray('─'.repeat(60)));
      console.log(result.code);
    } else {
      console.error(chalk.red(`✗ ${result.error}`));
    }
  });

genCmd
  .command('agent <role>')
  .description('Generate an agent configuration')
  .option('-s, --specialty <specialties...>', 'Specialties')
  .action(async (role, opts) => {
    const { generateAgent } = await import('./codegen/index.js');
    const result = await generateAgent(role, opts.specialty || []);
    if (result.success) {
      console.log(chalk.green('\n✓ Generated agent:'));
      console.log(JSON.stringify(result.data, null, 2));
    }
  });

genCmd
  .command('workflow <goal>')
  .description('Generate a workflow from goal')
  .action(async (goal) => {
    const { generateWorkflow } = await import('./codegen/index.js');
    const result = await generateWorkflow(goal);
    if (result.success) {
      console.log(chalk.green('\n✓ Generated workflow:'));
      console.log(JSON.stringify(result.data, null, 2));
    }
  });

genCmd
  .command('code <description>')
  .description('Generate code from natural language')
  .option('-l, --lang <language>', 'Language', 'typescript')
  .action(async (description, opts) => {
    const { naturalLanguageToCode } = await import('./codegen/index.js');
    const code = await naturalLanguageToCode(description, opts.lang);
    console.log(chalk.green('\n✓ Generated code:'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(code);
  });

// TUI interactive mode
program
  .command('tui')
  .alias('ui')
  .description('Start interactive TUI interface')
  .action(async () => {
    const { startTUI } = await import('./tui/index.js');
    startTUI();
  });

// Interactive mode (placeholder - now redirects to TUI)
program
  .command('shell')
  .alias('sh')
  .description('Start interactive shell (redirects to TUI)')
  .action(async () => {
    console.log(chalk.cyan('🚀 Starting TUI...'));
    const { startTUI } = await import('./tui/index.js');
    startTUI();
  });

// Main entry
async function main() {
  // Setup graceful shutdown
  process.on('SIGINT', () => {
    closeDB();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    closeDB();
    process.exit(0);
  });
  
  await program.parseAsync();
  closeDB();
}

main().catch((error) => {
  console.error(chalk.red(`Fatal error: ${error.message}`));
  closeDB();
  process.exit(1);
});
