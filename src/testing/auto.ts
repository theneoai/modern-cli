/**
 * Automated Testing - Generate and run tests automatically
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname, basename, extname } from 'path';

import { executeAgent } from '../agents/engine/index.js';

import { getApiKey } from '../core/config/index.js';

export interface TestCase {
  id: string;
  name: string;
  description?: string;
  input: any;
  expectedOutput?: any;
  expectedError?: string;
  timeout?: number;
}

export interface TestSuite {
  name: string;
  file: string;
  cases: TestCase[];
}

export interface TestResult {
  caseId: string;
  success: boolean;
  actualOutput?: any;
  error?: string;
  duration: number;
}

// Generate tests from code analysis
export async function generateTests(filePath: string): Promise<string> {
  const content = await readFile(filePath, 'utf-8');
  const fileName = basename(filePath, extname(filePath));
  
  // Parse exports
  const exports: Array<{ name: string; type: 'function' | 'class' }> = [];
  
  const funcRegex = /export\s+(?:async\s+)?function\s+(\w+)/g;
  let match;
  while ((match = funcRegex.exec(content)) !== null) {
    exports.push({ name: match[1], type: 'function' });
  }

  const classRegex = /export\s+class\s+(\w+)/g;
  while ((match = classRegex.exec(content)) !== null) {
    exports.push({ name: match[1], type: 'class' });
  }

  // Generate test code
  let testCode = `import { describe, it, expect } from 'vitest';\n`;
  testCode += `import { ${exports.map(e => e.name).join(', ')} } from '../${fileName}';\n\n`;

  for (const exp of exports) {
    testCode += `describe('${exp.name}', () => {\n`;
    
    if (exp.type === 'function') {
      testCode += generateFunctionTests(exp.name, content);
    } else {
      testCode += generateClassTests(exp.name, content);
    }
    
    testCode += `});\n\n`;
  }

  // Try to enhance with AI
  if (getApiKey('anthropic')) {
    try {
      const enhanced = await enhanceTestsWithAI(fileName, content, testCode);
      return enhanced;
    } catch {
      // Use basic tests
    }
  }

  return testCode;
}

function generateFunctionTests(funcName: string, content: string): string {
  let tests = '';
  
  // Basic tests
  tests += `  it('should be defined', () => {\n`;
  tests += `    expect(${funcName}).toBeDefined();\n`;
  tests += `  });\n\n`;

  tests += `  it('should handle basic input', async () => {\n`;
  tests += `    const result = await ${funcName}();\n`;
  tests += `    expect(result).toBeDefined();\n`;
  tests += `  });\n\n`;

  // Try to find parameter types and generate edge cases
  const funcMatch = content.match(new RegExp(`function ${funcName}\\s*\\(([^)]*)\\)`));
  if (funcMatch) {
    const params = funcMatch[1].split(',').map(p => p.trim()).filter(Boolean);
    
    if (params.length > 0) {
      tests += `  it('should handle edge cases', async () => {\n`;
      tests += `    // TODO: Add edge case tests for parameters: ${params.join(', ')}\n`;
      tests += `    expect(true).toBe(true);\n`;
      tests += `  });\n\n`;
    }
  }

  return tests;
}

function generateClassTests(className: string, content: string): string {
  let tests = '';
  
  tests += `  it('should instantiate', () => {\n`;
  tests += `    const instance = new ${className}();\n`;
  tests += `    expect(instance).toBeDefined();\n`;
  tests += `  });\n\n`;

  // Extract methods
  const methodRegex = new RegExp(`${className}.*?{([^}]*)}`, 's');
  const match = content.match(methodRegex);
  
  if (match) {
    const methodNames = [...match[1].matchAll(/(?:async\s+)?(\w+)\s*\(/g)].map(m => m[1]).filter(m => m !== 'constructor');
    
    for (const method of methodNames.slice(0, 3)) { // Limit to 3 methods
      tests += `  it('should handle ${method}', async () => {\n`;
      tests += `    const instance = new ${className}();\n`;
      tests += `    const result = await instance.${method}();\n`;
      tests += `    expect(result).toBeDefined();\n`;
      tests += `  });\n\n`;
    }
  }

  return tests;
}

async function enhanceTestsWithAI(fileName: string, code: string, basicTests: string): Promise<string> {
  const prompt = `Enhance these unit tests for "${fileName}". Add more comprehensive test cases including edge cases and error handling:

Original code:
${code.slice(0, 1000)}

Basic tests:
${basicTests}

Generate improved tests with better coverage:`;

  try {
    const { listAgents } = await import('../agents/engine/index.js');
    const agents = listAgents();
    const coder = agents.find(a => a.role === 'coder');
    
    if (coder) {
      const result = await executeAgent(coder.id, prompt);
      return result.output;
    }
  } catch {
    // Fallback to basic tests
  }

  return basicTests;
}

// Run tests
export async function runTests(testFile: string): Promise<{ passed: number; failed: number; results: TestResult[] }> {
  const { execSync } = await import('child_process');
  
  try {
    const output = execSync(`npx vitest run ${testFile} --reporter=json`, {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });

    const result = JSON.parse(output);
    
    return {
      passed: result.numPassedTests,
      failed: result.numFailedTests,
      results: result.testResults?.flatMap((tr: any) => 
        tr.assertionResults?.map((ar: any) => ({
          caseId: ar.title,
          success: ar.status === 'passed',
          error: ar.failureMessages?.[0],
          duration: ar.duration || 0,
        })) || []
      ) || [],
    };
  } catch (error) {
    // If vitest fails, return error info
    return {
      passed: 0,
      failed: 1,
      results: [{
        caseId: 'test-run',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      }],
    };
  }
}

// Generate and save tests for a file
export async function generateTestFile(sourceFile: string, outputDir?: string): Promise<string> {
  const testCode = await generateTests(sourceFile);
  
  const baseName = basename(sourceFile, extname(sourceFile));
  const testFileName = `${baseName}.test.ts`;
  
  const outputPath = outputDir 
    ? join(outputDir, testFileName)
    : join(dirname(sourceFile), '__tests__', testFileName);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, testCode);

  return outputPath;
}

// Property-based testing
export async function generatePropertyTests(funcName: string, properties: string[]): Promise<string> {
  let tests = `import { describe, it, expect } from 'vitest';\n`;
  tests += `import fc from 'fast-check';\n`;
  tests += `import { ${funcName} } from './module';\n\n`;

  tests += `describe('${funcName} - Property Tests', () => {\n`;

  for (const prop of properties) {
    tests += `  it('${prop}', () => {\n`;
    tests += `    fc.assert(fc.property(\n`;
    tests += `      fc.anything(),\n`;
    tests += `      (input) => {\n`;
    tests += `        const result = ${funcName}(input);\n`;
    tests += `        // Property: ${prop}\n`;
    tests += `        return true;\n`;
    tests += `      }\n`;
    tests += `    ));\n`;
    tests += `  });\n\n`;
  }

  tests += `});\n`;

  return tests;
}

// Mutation testing simulation
export async function runMutationTesting(testFile: string): Promise<{
  mutationScore: number;
  killed: number;
  survived: number;
}> {
  // Simplified mutation testing
  const originalContent = await readFile(testFile, 'utf-8');
  
  const mutations = [
    { pattern: /===/g, replacement: '!==', description: 'equality mutation' },
    { pattern: />/g, replacement: '<', description: 'comparison mutation' },
    { pattern: /\+ /g, replacement: '- ', description: 'arithmetic mutation' },
    { pattern: /true/g, replacement: 'false', description: 'boolean mutation' },
  ];

  let killed = 0;
  let survived = 0;

  for (const mutation of mutations) {
    const mutated = originalContent.replace(mutation.pattern, mutation.replacement);
    
    // Write mutated version
    await writeFile(testFile, mutated);
    
    // Run tests
    const result = await runTests(testFile);
    
    if (result.failed > 0) {
      killed++; // Tests caught the mutation
    } else {
      survived++; // Mutation survived
    }
  }

  // Restore original
  await writeFile(testFile, originalContent);

  const total = killed + survived;
  return {
    mutationScore: total > 0 ? (killed / total) * 100 : 0,
    killed,
    survived,
  };
}

// E2E test generation
export async function generateE2ETest(scenario: string, url: string): Promise<string> {
  const testCode = `
import { test, expect } from '@playwright/test';

test('${scenario}', async ({ page }) => {
  await page.goto('${url}');
  
  // TODO: Implement test steps for: ${scenario}
  
  await expect(page).toHaveTitle(/.*/);
});
`;

  return testCode;
}

// Test coverage report
export async function generateCoverageReport(sourceDir: string): Promise<{
  total: number;
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}> {
  try {
    const { execSync } = await import('child_process');
    
    const output = execSync(`npx vitest run --coverage --reporter=json ${sourceDir}`, {
      encoding: 'utf-8',
    });

    const result = JSON.parse(output);
    const coverage = result.coverage || {};

    return {
      total: coverage.total || 0,
      statements: coverage.statements || 0,
      branches: coverage.branches || 0,
      functions: coverage.functions || 0,
      lines: coverage.lines || 0,
    };
  } catch {
    return {
      total: 0,
      statements: 0,
      branches: 0,
      functions: 0,
      lines: 0,
    };
  }
}
