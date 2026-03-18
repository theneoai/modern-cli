/**
 * Documentation Generator - Auto-generate docs from code using AI
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, extname, relative, dirname } from 'path';
import { glob } from 'fast-glob';
import { getApiKey } from '../core/config/index.js';
import { executeAgent } from '../agents/engine/index.js';
// import { executeSkill } from '../skills/registry.js';

export interface DocConfig {
  sourceDir: string;
  outputDir: string;
  format: 'markdown' | 'html' | 'json';
  includePrivate: boolean;
  excludePatterns: string[];
  customSections?: string[];
}

export interface GeneratedDoc {
  filePath: string;
  title: string;
  content: string;
  generatedAt: Date;
  stats: {
    functions: number;
    classes: number;
    interfaces: number;
  };
}

// Parse code file for structure
export async function parseCodeFile(filePath: string): Promise<{
  functions: Array<{ name: string; params: string[]; returns?: string; comment?: string }>;
  classes: Array<{ name: string; methods: string[]; properties: string[]; comment?: string }>;
  interfaces: Array<{ name: string; properties: string[]; comment?: string }>;
  exports: string[];
}> {
  const content = await readFile(filePath, 'utf-8');
  
  // Simple regex-based parsing (in production, use AST parser)
  const functions: Array<{ name: string; params: string[]; returns?: string; comment?: string }> = [];
  const classes: Array<{ name: string; methods: string[]; properties: string[]; comment?: string }> = [];
  const interfaces: Array<{ name: string; properties: string[]; comment?: string }> = [];
  const exports: string[] = [];

  // Extract functions
  const funcRegex = /(?:\/\*\*[\s\S]*?\*\/\s*)?(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^\{]+))?/g;
  let match;
  while ((match = funcRegex.exec(content)) !== null) {
    const commentMatch = content.slice(0, match.index).match(/\/\*\*([\s\S]*?)\*\/\s*$/);
    functions.push({
      name: match[1],
      params: match[2].split(',').map(p => p.trim()).filter(Boolean),
      returns: match[3]?.trim(),
      comment: commentMatch ? commentMatch[1].replace(/\s*\*\s*/g, ' ').trim() : undefined,
    });
  }

  // Extract exports
  const exportRegex = /export\s+(?:{([^}]+)}|(?:const|let|var|function|class|interface)\s+(\w+))/g;
  while ((match = exportRegex.exec(content)) !== null) {
    if (match[1]) {
      // Named exports: export { a, b, c }
      match[1].split(',').forEach(e => exports.push(e.trim().split(' ')[0]));
    } else if (match[2]) {
      // Direct export: export const x
      exports.push(match[2]);
    }
  }

  return { functions, classes, interfaces, exports };
}

// Generate documentation for a file
export async function generateFileDoc(filePath: string, config: DocConfig): Promise<GeneratedDoc> {
  const parsed = await parseCodeFile(filePath);
  const fileName = filePath.split('/').pop() || '';
  
  let content = `# ${fileName}\n\n`;
  content += `**Source:** \`${filePath}\`\n\n`;

  // Generate summary
  
  content += `## Overview\n\n`;
  content += `- **Functions:** ${parsed.functions.length}\n`;
  content += `- **Classes:** ${parsed.classes.length}\n`;
  content += `- **Interfaces:** ${parsed.interfaces.length}\n`;
  content += `- **Exports:** ${parsed.exports.join(', ')}\n\n`;

  // Functions
  if (parsed.functions.length > 0) {
    content += `## Functions\n\n`;
    for (const fn of parsed.functions) {
      content += `### ${fn.name}(${fn.params.join(', ')})\n\n`;
      if (fn.comment) content += `${fn.comment}\n\n`;
      if (fn.returns) content += `- **Returns:** \`${fn.returns}\`\n`;
      content += `\n`;
    }
  }

  // Classes
  if (parsed.classes.length > 0) {
    content += `## Classes\n\n`;
    for (const cls of parsed.classes) {
      content += `### ${cls.name}\n\n`;
      if (cls.comment) content += `${cls.comment}\n\n`;
      if (cls.methods.length > 0) content += `- **Methods:** ${cls.methods.join(', ')}\n`;
      if (cls.properties.length > 0) content += `- **Properties:** ${cls.properties.join(', ')}\n`;
      content += `\n`;
    }
  }

  // Use AI to enhance documentation
  if (getApiKey('anthropic')) {
    try {
      const codeSnippet = (await readFile(filePath, 'utf-8')).slice(0, 2000);
      const aiSummary = await generateAISummary(fileName, codeSnippet);
      content = `# ${fileName}\n\n## AI Summary\n\n${aiSummary}\n\n---\n\n${content}`;
    } catch {
      // Continue without AI enhancement
    }
  }

  const outputPath = join(config.outputDir, relative(config.sourceDir, filePath).replace(extname(filePath), '.md'));

  return {
    filePath: outputPath,
    title: fileName,
    content,
    generatedAt: new Date(),
    stats: {
      functions: parsed.functions.length,
      classes: parsed.classes.length,
      interfaces: parsed.interfaces.length,
    },
  };
}

// Generate AI summary
async function generateAISummary(fileName: string, code: string): Promise<string> {
  const prompt = `Analyze this code file "${fileName}" and provide a concise summary (2-3 sentences) of its purpose and main functionality:\n\n${code}`;
  
  try {
    // Try to use an agent
    const { listAgents } = await import('../agents/engine/index.js');
    const agents = listAgents();
    const reviewer = agents.find(a => a.role === 'reviewer');
    
    if (reviewer) {
      const result = await executeAgent(reviewer.id, prompt);
      return result.output;
    }
  } catch {
    // Fallback
  }

  return 'Code analysis not available.';
}

// Generate documentation for entire project
export async function generateProjectDocs(config: DocConfig): Promise<GeneratedDoc[]> {
  const files = await glob('**/*.{ts,js,tsx,jsx}', {
    cwd: config.sourceDir,
    ignore: config.excludePatterns,
  });

  const docs: GeneratedDoc[] = [];

  for (const file of files) {
    const fullPath = join(config.sourceDir, file);
    const doc = await generateFileDoc(fullPath, config);
    docs.push(doc);

    // Ensure output directory exists
    await mkdir(dirname(doc.filePath), { recursive: true });
    
    // Write doc file
    await writeFile(doc.filePath, doc.content);
  }

  // Generate index
  await generateIndexDoc(docs, config);

  return docs;
}

// Generate index documentation
async function generateIndexDoc(docs: GeneratedDoc[], config: DocConfig): Promise<void> {
  let index = `# Project Documentation\n\n`;
  index += `Generated: ${new Date().toISOString()}\n\n`;
  
  index += `## Files\n\n`;
  for (const doc of docs.sort((a, b) => a.title.localeCompare(b.title))) {
    const relativePath = relative(config.outputDir, doc.filePath);
    index += `- [${doc.title}](${relativePath}) - ${doc.stats.functions} functions, ${doc.stats.classes} classes\n`;
  }

  index += `\n## Statistics\n\n`;
  const totalFunctions = docs.reduce((sum, d) => sum + d.stats.functions, 0);
  const totalClasses = docs.reduce((sum, d) => sum + d.stats.classes, 0);
  index += `- Total Functions: ${totalFunctions}\n`;
  index += `- Total Classes: ${totalClasses}\n`;
  index += `- Total Files: ${docs.length}\n`;

  const indexPath = join(config.outputDir, 'README.md');
  await writeFile(indexPath, index);
}

// Generate API documentation from OpenAPI/Swagger
export async function generateAPIDocs(specPath: string, outputDir: string): Promise<void> {
  const spec = JSON.parse(await readFile(specPath, 'utf-8'));
  
  let markdown = `# API Documentation\n\n`;
  markdown += `Base URL: \`${spec.servers?.[0]?.url || 'http://localhost'}\`\n\n`;

  for (const [path, methods] of Object.entries(spec.paths || {})) {
    markdown += `## ${path}\n\n`;
    
    for (const [method, details] of Object.entries(methods as any)) {
      if (typeof details !== 'object') continue;
      
      markdown += `### ${method.toUpperCase()}\n\n`;
      markdown += `${details.summary || ''}\n\n`;
      
      if (details.parameters?.length) {
        markdown += `**Parameters:**\n\n`;
        for (const param of details.parameters) {
          markdown += `- \`${param.name}\` (${param.in})${param.required ? ' **required**' : ''}: ${param.description || ''}\n`;
        }
        markdown += `\n`;
      }

      if (details.responses) {
        markdown += `**Responses:**\n\n`;
        for (const [code, response] of Object.entries(details.responses)) {
          markdown += `- \`${code}\`: ${(response as any).description || ''}\n`;
        }
        markdown += `\n`;
      }
    }
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'API.md'), markdown);
}

// Watch mode for live documentation
export async function watchAndRegenerate(config: DocConfig): Promise<void> {
  const { watch } = await import('chokidar');
  
  const watcher = watch('**/*.{ts,js}', {
    cwd: config.sourceDir,
    ignored: config.excludePatterns,
    persistent: true,
  });

  console.log('👀 Watching for changes...');

  watcher.on('change', (filePath) => {
    console.log(`📝 ${filePath} changed, regenerating docs...`);
    const fullPath = join(config.sourceDir, filePath);
    generateFileDoc(fullPath, config).then(async (doc) => {
      await mkdir(dirname(doc.filePath), { recursive: true });
      await writeFile(doc.filePath, doc.content);
      console.log(`✅ Docs regenerated: ${doc.filePath}`);
    }).catch((error) => {
      console.error(`❌ Failed to regenerate docs:`, error);
    });
  });
}

// Init docs directory
export function initDocsDir(): void {
  // No DB tables needed for docs
}
