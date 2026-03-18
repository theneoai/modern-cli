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

// Browser automation commands
const browserCmd = program
  .command('browser')
  .alias('br')
  .description('Browser automation');

browserCmd
  .command('scrape <url>')
  .description('Quick scrape a webpage')
  .option('-s, --selectors <json>', 'CSS selectors as JSON', '{}')
  .action(async (url, opts) => {
    const { quickScrape, initBrowserTables } = await import('./browser/index.js');
    initBrowserTables();
    
    console.log(chalk.cyan(`\n🌐 Scraping: ${url}`));
    try {
      const selectors = JSON.parse(opts.selectors);
      const results = await quickScrape(url, selectors);
      console.log(chalk.green('✓ Results:'));
      console.log(JSON.stringify(results, null, 2));
    } catch (error) {
      console.error(chalk.red(`✗ Error: ${error instanceof Error ? error.message : String(error)}`));
    }
  });

browserCmd
  .command('ai-scrape <url>')
  .description('AI-powered scraping with instructions')
  .action(async (url) => {
    const { aiScrape, initBrowserTables } = await import('./browser/index.js');
    initBrowserTables();
    
    console.log(chalk.cyan(`\n🤖 AI Scraping: ${url}`));
    const results = await aiScrape(url, 'Extract all structured data');
    console.log(chalk.green('✓ Results:'));
    console.log(JSON.stringify(results, null, 2));
  });

// Scheduler commands
const schedulerCmd = program
  .command('scheduler')
  .alias('sch')
  .description('Task scheduler');

schedulerCmd
  .command('list')
  .description('List scheduled jobs')
  .action(() => {
    const { listScheduledJobs, initSchedulerTables } = require('./scheduler/index.js');
    initSchedulerTables();
    const jobs = listScheduledJobs();
    console.log(chalk.cyan('\n⏰ Scheduled Jobs:'));
    console.log(chalk.gray('─'.repeat(60)));
    for (const job of jobs) {
      const status = job.enabled ? chalk.green('●') : chalk.gray('○');
      console.log(`${status} ${chalk.bold(job.name)} ${chalk.gray(`(${job.type})`)}`);
      console.log(`  Cron: ${job.cronExpression}`);
      console.log(`  Next: ${job.nextRun?.toLocaleString() || 'N/A'}`);
      console.log(`  Runs: ${job.runCount} ✓ / ${job.failCount} ✗`);
      console.log();
    }
  });

schedulerCmd
  .command('create <name>')
  .description('Create scheduled job')
  .requiredOption('-c, --cron <expression>', 'Cron expression')
  .requiredOption('-t, --type <type>', 'Job type: workflow, agent, skill, script')
  .requiredOption('--target <id>', 'Target ID or script')
  .action((name, opts) => {
    const { createScheduledJob, initSchedulerTables } = require('./scheduler/index.js');
    initSchedulerTables();
    
    const job = createScheduledJob({
      name,
      cronExpression: opts.cron,
      type: opts.type,
      targetId: opts.target,
    });
    
    console.log(chalk.green(`✓ Created job: ${job.name}`));
    console.log(chalk.gray(`  ID: ${job.id}`));
    console.log(chalk.gray(`  Next run: ${job.nextRun?.toLocaleString()}`));
  });

schedulerCmd
  .command('start')
  .description('Start scheduler daemon')
  .action(async () => {
    const { startScheduler, initSchedulerTables } = await import('./scheduler/index.js');
    initSchedulerTables();
    startScheduler();
    console.log(chalk.green('⏰ Scheduler started (Press Ctrl+C to stop)'));
    
    // Keep process alive
    setInterval(() => {}, 1000);
  });

// GitHub integration commands
const githubCmd = program
  .command('github')
  .alias('gh')
  .description('GitHub integration');

githubCmd
  .command('prs <owner> <repo>')
  .description('List pull requests')
  .option('-s, --state <state>', 'State: open, closed, all', 'open')
  .action(async (owner, repo, opts) => {
    const { listPullRequests, initGitHubTables } = await import('./github/index.js');
    initGitHubTables();
    
    try {
      const prs = await listPullRequests(owner, repo, opts.state);
      console.log(chalk.cyan(`\n🔀 Pull Requests (${owner}/${repo}):`));
      console.log(chalk.gray('─'.repeat(60)));
      for (const pr of prs.slice(0, 10)) {
        console.log(`#${pr.number} ${chalk.bold(pr.title)} ${chalk.gray(`@${pr.user}`)}`);
        console.log(`  ${chalk.green('+' + pr.additions)} ${chalk.red('-' + pr.deletions)} files: ${pr.changedFiles}`);
        console.log();
      }
    } catch (error) {
      console.error(chalk.red(`✗ ${error instanceof Error ? error.message : String(error)}`));
    }
  });

githubCmd
  .command('review <owner> <repo> <number>')
  .description('AI review a pull request')
  .action(async (owner, repo, number) => {
    const { reviewPullRequest, initGitHubTables } = await import('./github/index.js');
    initGitHubTables();
    
    console.log(chalk.cyan(`\n🔍 Reviewing PR #${number}...`));
    try {
      const review = await reviewPullRequest(owner, repo, parseInt(number), {
        checkSecurity: true,
        checkPerformance: true,
        checkStyle: true,
      });
      console.log(chalk.green('\n✓ Review complete:'));
      console.log(review.summary);
      
      if (review.comments.length > 0) {
        console.log(chalk.yellow('\n⚠️ Issues found:'));
        for (const comment of review.comments) {
          console.log(`  [${comment.severity}] ${comment.comment}`);
        }
      }
    } catch (error) {
      console.error(chalk.red(`✗ ${error instanceof Error ? error.message : String(error)}`));
    }
  });

githubCmd
  .command('issues <owner> <repo>')
  .description('List issues')
  .action(async (owner, repo) => {
    const { listIssues, initGitHubTables } = await import('./github/index.js');
    initGitHubTables();
    
    try {
      const issues = await listIssues(owner, repo);
      console.log(chalk.cyan(`\n📋 Issues (${owner}/${repo}):`));
      console.log(chalk.gray('─'.repeat(60)));
      for (const issue of issues.slice(0, 10)) {
        const labels = issue.labels.map(l => chalk.gray(`[${l}]`)).join(' ');
        console.log(`#${issue.number} ${chalk.bold(issue.title)} ${labels}`);
        console.log(`  @${issue.user} - ${issue.state}`);
        console.log();
      }
    } catch (error) {
      console.error(chalk.red(`✗ ${error instanceof Error ? error.message : String(error)}`));
    }
  });

// Documentation commands
const docsCmd = program
  .command('docs')
  .description('Documentation generator');

docsCmd
  .command('generate <source>')
  .description('Generate docs from source code')
  .option('-o, --output <dir>', 'Output directory', './docs')
  .action(async (source, opts) => {
    const { generateProjectDocs } = await import('./docs/generator.js');
    
    console.log(chalk.cyan(`\n📝 Generating documentation...`));
    try {
      const docs = await generateProjectDocs({
        sourceDir: source,
        outputDir: opts.output,
        format: 'markdown',
        includePrivate: false,
        excludePatterns: ['node_modules', 'dist', '__tests__'],
      });
      console.log(chalk.green(`✓ Generated ${docs.length} documentation files`));
      console.log(chalk.gray(`  Output: ${opts.output}`));
    } catch (error) {
      console.error(chalk.red(`✗ ${error instanceof Error ? error.message : String(error)}`));
    }
  });

// Testing commands
const testCmd = program
  .command('test')
  .description('Automated testing');

testCmd
  .command('generate <file>')
  .description('Generate tests for a file')
  .option('-o, --output <dir>', 'Output directory')
  .action(async (file, opts) => {
    const { generateTestFile } = await import('./testing/auto.js');
    
    console.log(chalk.cyan(`\n🧪 Generating tests for ${file}...`));
    try {
      const testPath = await generateTestFile(file, opts.output);
      console.log(chalk.green(`✓ Test file created: ${testPath}`));
    } catch (error) {
      console.error(chalk.red(`✗ ${error instanceof Error ? error.message : String(error)}`));
    }
  });

testCmd
  .command('run <file>')
  .description('Run tests')
  .action(async (file) => {
    const { runTests } = await import('./testing/auto.js');
    
    console.log(chalk.cyan(`\n▶️ Running tests: ${file}`));
    const results = await runTests(file);
    
    console.log(chalk.green(`\n✓ Passed: ${results.passed}`));
    if (results.failed > 0) {
      console.log(chalk.red(`✗ Failed: ${results.failed}`));
    }
  });

// Notification commands
const notifyCmd = program
  .command('notify')
  .description('Notification system');

notifyCmd
  .command('server')
  .description('Start notification WebSocket server')
  .option('-p, --port <port>', 'Port', '8080')
  .action(async (opts) => {
    const { initNotificationServer, initNotificationTables } = await import('./notifications/index.js');
    initNotificationTables();
    initNotificationServer(parseInt(opts.port));
    console.log(chalk.green(`🔔 Notification server started on port ${opts.port}`));
    
    // Keep alive
    setInterval(() => {}, 1000);
  });

notifyCmd
  .command('send <title>')
  .description('Send notification')
  .option('-b, --body <text>', 'Body text')
  .option('-t, --target <agent>', 'Target agent ID')
  .option('-p, --priority <level>', 'Priority: low, medium, high, urgent', 'medium')
  .action((title, opts) => {
    const { sendNotification, initNotificationTables } = require('./notifications/index.js');
    initNotificationTables();
    
    sendNotification({
      type: 'info',
      title,
      body: opts.body,
      target: opts.target,
      priority: opts.priority,
      source: 'cli',
      read: false,
    });
    
    console.log(chalk.green('✓ Notification sent'));
  });

// Dashboard commands
const dashboardCmd = program
  .command('dashboard')
  .alias('dash')
  .description('Data visualization');

dashboardCmd
  .command('agents')
  .description('Generate agent activity dashboard')
  .option('-o, --output <path>', 'Output path', './dashboard.html')
  .action(async (opts) => {
    const { generateAgentDashboard } = await import('./visualization/index.js');
    
    console.log(chalk.cyan('\n📊 Generating agent dashboard...'));
    await generateAgentDashboard(opts.output);
    console.log(chalk.green(`✓ Dashboard saved: ${opts.output}`));
  });

dashboardCmd
  .command('economy')
  .description('Generate economy dashboard')
  .option('-o, --output <path>', 'Output path', './economy-dashboard.html')
  .action(async (opts) => {
    const { generateEconomyDashboard } = await import('./visualization/index.js');
    
    console.log(chalk.cyan('\n📊 Generating economy dashboard...'));
    await generateEconomyDashboard(opts.output);
    console.log(chalk.green(`✓ Dashboard saved: ${opts.output}`));
  });

// Voice commands
const voiceCmd = program
  .command('voice')
  .description('Voice system');

voiceCmd
  .command('memo')
  .description('Create voice memo')
  .requiredOption('-f, --file <path>', 'Audio file path')
  .option('-t, --title <title>', 'Memo title')
  .action(async (opts) => {
    const { createVoiceMemo, initVoiceTables } = await import('./voice/index.js');
    initVoiceTables();
    
    console.log(chalk.cyan('\n🎤 Processing voice memo...'));
    try {
      const memo = await createVoiceMemo(opts.file, opts.title);
      console.log(chalk.green(`✓ Memo created: ${memo.id}`));
      if (memo.transcription) {
        console.log(chalk.gray('Transcription:'));
        console.log(memo.transcription);
      }
    } catch (error) {
      console.error(chalk.red(`✗ ${error instanceof Error ? error.message : String(error)}`));
    }
  });

voiceCmd
  .command('list')
  .description('List voice memos')
  .action(() => {
    const { getVoiceMemos, initVoiceTables } = require('./voice/index.js');
    initVoiceTables();
    
    const memos = getVoiceMemos();
    console.log(chalk.cyan('\n🎤 Voice Memos:'));
    console.log(chalk.gray('─'.repeat(60)));
    for (const memo of memos) {
      console.log(`${chalk.bold(memo.title)} ${chalk.gray(`(${Math.round(memo.duration)}s)`)}`);
      if (memo.transcription) {
        console.log(`  "${memo.transcription.slice(0, 80)}..."`);
      }
      console.log();
    }
  });

// Knowledge graph commands
const kgCmd = program
  .command('knowledge')
  .alias('kg')
  .description('Knowledge graph');

kgCmd
  .command('node <label>')
  .description('Create knowledge node')
  .option('-t, --type <type>', 'Node type', 'concept')
  .action((label, opts) => {
    const { createNode, initKnowledgeTables } = require('./knowledge/graph.js');
    initKnowledgeTables();
    
    const node = createNode(opts.type, label);
    console.log(chalk.green(`✓ Created node: ${node.id}`));
    console.log(chalk.gray(`  Label: ${node.label}`));
    console.log(chalk.gray(`  Type: ${node.type}`));
  });

kgCmd
  .command('connect <from> <to>')
  .description('Connect two nodes')
  .requiredOption('-r, --relation <type>', 'Relationship type')
  .action((from, to, opts) => {
    const { createEdge, initKnowledgeTables } = require('./knowledge/graph.js');
    initKnowledgeTables();
    
    const edge = createEdge(from, to, opts.relation);
    console.log(chalk.green(`✓ Created connection: ${edge.id}`));
  });

kgCmd
  .command('search <query>')
  .description('Search knowledge graph')
  .action((query) => {
    const { findNodes, initKnowledgeTables } = require('./knowledge/graph.js');
    initKnowledgeTables();
    
    const nodes = findNodes({ query });
    console.log(chalk.cyan(`\n🔍 Found ${nodes.length} nodes:`));
    for (const node of nodes) {
      console.log(`${chalk.bold(node.label)} ${chalk.gray(`(${node.type})`)}`);
      console.log(`  ID: ${node.id.slice(0, 8)}`);
      console.log();
    }
  });

kgCmd
  .command('export')
  .description('Export knowledge graph')
  .option('-f, --format <format>', 'Format: json, cypher, dot', 'json')
  .option('-o, --output <path>', 'Output file')
  .action((opts) => {
    const { exportGraph, initKnowledgeTables } = require('./knowledge/graph.js');
    initKnowledgeTables();
    
    const data = exportGraph(opts.format);
    
    if (opts.output) {
      const { writeFileSync } = require('fs');
      writeFileSync(opts.output, data);
      console.log(chalk.green(`✓ Exported to: ${opts.output}`));
    } else {
      console.log(data);
    }
  });

kgCmd
  .command('visualize')
  .description('Generate graph visualization')
  .option('-o, --output <path>', 'Output path', './knowledge-graph.svg')
  .action(async (opts) => {
    const { generateGraphSVG, initKnowledgeTables } = await import('./knowledge/graph.js');
    initKnowledgeTables();
    
    const svg = generateGraphSVG();
    const { writeFile } = await import('fs/promises');
    await writeFile(opts.output, svg);
    console.log(chalk.green(`✓ Graph saved: ${opts.output}`));
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
