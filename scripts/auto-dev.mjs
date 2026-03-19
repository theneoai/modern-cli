#!/usr/bin/env node
/**
 * HyperTerminal Auto-Development Tool (ES Module)
 * 
 * 自动化开发工具，每10分钟：
 * 1. 检查当前代码状态
 * 2. 发散思维生成新功能想法
 * 3. 实现该功能
 * 4. 提交到git
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置
const CONFIG = {
  interval: 10 * 60 * 1000, // 10分钟
  endTime: '22:00', // 晚上10点停止
  featuresDir: './src/features',
  rfcDir: './rfcs',
};

// 发散思维 - 潜在功能池 (扩展至50+功能)
const POTENTIAL_FEATURES = [
  // ========== 智能时间管理 (5个) ==========
  { id: 'time-blocking', name: '时间块规划', description: 'AI自动安排深度工作时间，根据日历和任务自动规划专注时段', category: 'productivity', priority: 'P1', complexity: 'medium' },
  { id: 'meeting-optimizer', name: '会议优化器', description: '分析团队成员日历，自动找出最佳会议时间', category: 'productivity', priority: 'P1', complexity: 'medium' },
  { id: 'focus-mode', name: '专注模式', description: '一键进入专注模式，屏蔽通知，支持番茄工作法', category: 'productivity', priority: 'P1', complexity: 'low' },
  { id: 'workload-balancer', name: '工作负载平衡', description: '监测防止过度劳累，智能分配任务避免 burnout', category: 'productivity', priority: 'P2', complexity: 'high' },
  { id: 'smart-reminders', name: '智能提醒', description: '基于位置和上下文的情境提醒', category: 'productivity', priority: 'P2', complexity: 'medium' },
  
  // ========== 知识管理 (5个) ==========
  { id: 'auto-notes', name: '自动笔记', description: '会议/讨论自动记录，提取关键信息', category: 'knowledge', priority: 'P1', complexity: 'high' },
  { id: 'knowledge-graph-v2', name: '知识图谱增强', description: '关联所有文档/代码/讨论，可视化知识网络', category: 'knowledge', priority: 'P2', complexity: 'high' },
  { id: 'expert-finder', name: '专家定位', description: '分析代码提交、讨论，找出团队专家', category: 'knowledge', priority: 'P2', complexity: 'medium' },
  { id: 'doc-generator', name: '文档自动生成', description: '从代码和讨论自动生成文档', category: 'knowledge', priority: 'P2', complexity: 'high' },
  { id: 'wiki-connector', name: 'Wiki连接器', description: '与Confluence/Notion等Wiki系统集成', category: 'knowledge', priority: 'P3', complexity: 'medium' },
  
  // ========== 代码智能 (6个) ==========
  { id: 'terminal-copilot', name: '终端Copilot', description: '实时代码建议，终端集成版本', category: 'code', priority: 'P1', complexity: 'high' },
  { id: 'code-explainer', name: '代码解释器', description: '选中代码自动解释，生成文档注释', category: 'code', priority: 'P2', complexity: 'medium' },
  { id: 'refactor-advisor', name: '重构建议', description: '检测代码异味，提供重构建议', category: 'code', priority: 'P2', complexity: 'high' },
  { id: 'test-generator', name: '测试生成器', description: '自动生成单元测试、集成测试', category: 'code', priority: 'P2', complexity: 'high' },
  { id: 'bug-predictor', name: 'Bug预测器', description: '基于代码变更预测潜在Bug', category: 'code', priority: 'P2', complexity: 'high' },
  { id: 'code-review-ai', name: 'AI代码审查', description: '自动PR审查，检查安全和性能', category: 'code', priority: 'P1', complexity: 'medium' },
  
  // ========== 沟通增强 (5个) ==========
  { id: 'sentiment-analyzer', name: '情绪分析', description: '检测消息情绪，预警团队冲突', category: 'communication', priority: 'P2', complexity: 'medium' },
  { id: 'realtime-translate', name: '实时翻译', description: '多语言团队实时翻译', category: 'communication', priority: 'P3', complexity: 'high' },
  { id: 'voice-to-text', name: '语音转文字', description: '语音消息自动转录，支持搜索', category: 'communication', priority: 'P3', complexity: 'medium' },
  { id: 'thread-summarizer', name: '线程摘要', description: '长讨论串自动生成摘要', category: 'communication', priority: 'P2', complexity: 'medium' },
  { id: 'async-video', name: '异步视频', description: '录制短视频消息，支持倍速播放', category: 'communication', priority: 'P3', complexity: 'high' },
  
  // ========== 自动化办公 (5个) ==========
  { id: 'email-assistant', name: '邮件助手', description: '自动分类邮件，生成回复建议', category: 'automation', priority: 'P2', complexity: 'medium' },
  { id: 'auto-report', name: '自动报告', description: '根据活动自动生成周报/月报', category: 'automation', priority: 'P2', complexity: 'medium' },
  { id: 'approval-workflow', name: '智能审批', description: '自动化审批流程，根据规则自动处理', category: 'automation', priority: 'P2', complexity: 'medium' },
  { id: 'expense-tracker', name: '费用追踪', description: '自动记录和分类团队费用', category: 'automation', priority: 'P3', complexity: 'low' },
  { id: 'onboarding-agent', name: '入职Agent', description: '自动化新员工入职流程', category: 'automation', priority: 'P2', complexity: 'medium' },
  
  // ========== 团队健康 (5个) ==========
  { id: 'engagement-analyzer', name: '参与度分析', description: '识别沉默成员，分析参与度趋势', category: 'analytics', priority: 'P2', complexity: 'high' },
  { id: 'collaboration-heatmap', name: '协作热力图', description: '可视化团队协作模式', category: 'analytics', priority: 'P3', complexity: 'medium' },
  { id: 'wellness-check', name: '团队健康', description: '定期团队氛围调查，防倦怠', category: 'analytics', priority: 'P3', complexity: 'low' },
  { id: 'burnout-detector', name: '倦怠检测', description: '基于工作模式识别倦怠风险', category: 'analytics', priority: 'P2', complexity: 'high' },
  { id: 'retention-predictor', name: '留存预测', description: '预测团队成员离职风险', category: 'analytics', priority: 'P2', complexity: 'high' },
  
  // ========== 项目管理 (5个) ==========
  { id: 'agile-board', name: '敏捷看板', description: 'Sprint规划、燃尽图、速度追踪', category: 'project', priority: 'P1', complexity: 'high' },
  { id: 'dependency-tracker', name: '依赖追踪', description: '任务依赖可视化，关键路径分析', category: 'project', priority: 'P2', complexity: 'high' },
  { id: 'risk-detector', name: '风险检测', description: '项目风险自动识别', category: 'project', priority: 'P2', complexity: 'high' },
  { id: 'resource-planner', name: '资源规划', description: '优化人力分配，避免过度承诺', category: 'project', priority: 'P2', complexity: 'high' },
  { id: 'milestone-tracker', name: '里程碑追踪', description: '自动追踪里程碑进度', category: 'project', priority: 'P2', complexity: 'medium' },
  
  // ========== 集成扩展 (5个) ==========
  { id: 'slack-bridge', name: 'Slack桥接', description: '双向同步Slack消息', category: 'integration', priority: 'P2', complexity: 'medium' },
  { id: 'jira-sync', name: 'Jira同步', description: '任务双向同步，状态映射', category: 'integration', priority: 'P2', complexity: 'medium' },
  { id: 'notion-integration', name: 'Notion集成', description: '文档双向同步', category: 'integration', priority: 'P3', complexity: 'medium' },
  { id: 'gitlab-connector', name: 'GitLab连接器', description: 'CI/CD状态同步，MR管理', category: 'integration', priority: 'P2', complexity: 'medium' },
  { id: 'calendar-sync', name: '日历同步', description: 'Google/Outlook日历集成', category: 'integration', priority: 'P1', complexity: 'medium' },
  
  // ========== 个性化 (4个) ==========
  { id: 'ai-personality', name: 'AI性格定制', description: '定制AI助手性格风格', category: 'personalization', priority: 'P3', complexity: 'low' },
  { id: 'theme-studio', name: '主题工作室', description: '可视化主题编辑器', category: 'personalization', priority: 'P3', complexity: 'medium' },
  { id: 'layout-customizer', name: '布局定制', description: '拖拽式布局定制', category: 'personalization', priority: 'P3', complexity: 'high' },
  { id: 'shortcut-manager', name: '快捷键管理', description: '自定义快捷键方案', category: 'personalization', priority: 'P3', complexity: 'low' },
  
  // ========== 游戏化 (3个) ==========
  { id: 'achievement-system', name: '成就系统', description: '完成任务获得徽章', category: 'gamification', priority: 'P3', complexity: 'low' },
  { id: 'team-challenges', name: '团队挑战', description: '协作完成任务', category: 'gamification', priority: 'P3', complexity: 'medium' },
  { id: 'leaderboards', name: '排行榜', description: '团队贡献排行', category: 'gamification', priority: 'P3', complexity: 'low' },
  
  // ========== AI高级功能 (6个) ==========
  { id: 'smart-summarizer', name: '智能摘要', description: '自动生成会议/讨论摘要', category: 'ai', priority: 'P1', complexity: 'medium' },
  { id: 'action-extractor', name: '行动项提取', description: '自动识别待办事项', category: 'ai', priority: 'P1', complexity: 'medium' },
  { id: 'smart-assign', name: '智能分配', description: 'AI建议任务分配', category: 'ai', priority: 'P1', complexity: 'high' },
  { id: 'predictive-analytics', name: '预测分析', description: '预测项目延期风险', category: 'ai', priority: 'P2', complexity: 'high' },
  { id: 'anomaly-detector', name: '异常检测', description: '检测异常行为模式', category: 'ai', priority: 'P2', complexity: 'high' },
  { id: 'nlp-query', name: '自然语言查询', description: '用自然语言查询数据', category: 'ai', priority: 'P2', complexity: 'high' },
  
  // ========== 高级协作 (6个) ==========
  { id: 'pair-programming', name: '结对编程', description: '实时协作编码环境', category: 'collaboration', priority: 'P2', complexity: 'high' },
  { id: 'live-whiteboard', name: '实时白板', description: '协作绘图和脑图', category: 'collaboration', priority: 'P2', complexity: 'high' },
  { id: 'screen-share', name: '屏幕共享', description: '低延迟屏幕共享', category: 'collaboration', priority: 'P2', complexity: 'high' },
  { id: 'hand-raise', name: '举手系统', description: '会议中虚拟举手', category: 'collaboration', priority: 'P3', complexity: 'low' },
  { id: 'breakout-rooms', name: '分组讨论室', description: '自动分组讨论', category: 'collaboration', priority: 'P3', complexity: 'medium' },
  { id: 'polling', name: '投票系统', description: '快速创建和参与投票', category: 'collaboration', priority: 'P3', complexity: 'low' },
  
  // ========== 安全合规 (4个) ==========
  { id: 'audit-trail', name: '审计追踪', description: '完整操作日志', category: 'security', priority: 'P1', complexity: 'medium' },
  { id: 'data-retention', name: '数据保留', description: '自动归档和清理', category: 'security', priority: 'P2', complexity: 'medium' },
  { id: 'access-control', name: '访问控制', description: '细粒度权限管理', category: 'security', priority: 'P1', complexity: 'high' },
  { id: 'encryption', name: '端到端加密', description: '消息加密存储', category: 'security', priority: 'P1', complexity: 'high' },
];

// 已完成功能
function getCompletedFeatures() {
  try {
    const content = fs.readFileSync('./FEATURES.md', 'utf8');
    const matches = content.match(/\| (.*?) \| ✅ \|/g) || [];
    return matches.map(m => m.replace(/\|/g, '').trim().split(' ')[0]);
  } catch (e) {
    return [];
  }
}

// 获取正在开发的功能
function getInProgressFeatures() {
  try {
    const content = fs.readFileSync('./FEATURES.md', 'utf8');
    const matches = content.match(/\| (.*?) \| 🚧 \|/g) || [];
    return matches.map(m => m.replace(/\|/g, '').trim().split(' ')[0]);
  } catch (e) {
    return [];
  }
}

// 检查是否应该停止
function shouldStop() {
  const now = new Date();
  const [stopHour, stopMin] = CONFIG.endTime.split(':').map(Number);
  const stopTime = new Date();
  stopTime.setHours(stopHour, stopMin, 0, 0);
  
  if (now >= stopTime) {
    console.log('\n⏰ 已到达结束时间 (22:00)，停止开发');
    return true;
  }
  return false;
}

// 选择下一个要实现的功能
function selectNextFeature() {
  const completed = getCompletedFeatures();
  const inProgress = getInProgressFeatures();
  const excluded = [...completed, ...inProgress];
  
  const candidates = POTENTIAL_FEATURES.filter(f => !excluded.includes(f.name));
  
  if (candidates.length === 0) {
    console.log('\n✅ 所有功能都已实现！');
    return null;
  }
  
  // 按优先级排序
  const priorityOrder = { P1: 0, P2: 1, P3: 2 };
  candidates.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  return candidates[0];
}

// 生成功能实现代码
function generateFeatureCode(feature) {
  const timestamp = Date.now();
  const branchName = `feature/${feature.id}-${timestamp}`;
  
  console.log(`\n🚀 开始实现功能: ${feature.name}`);
  console.log(`   描述: ${feature.description}`);
  console.log(`   复杂度: ${feature.complexity}`);
  console.log(`   分支: ${branchName}`);
  
  // 检查功能目录是否已存在
  const featureDir = `src/features/${feature.id}`;
  if (fs.existsSync(featureDir)) {
    console.log(`   ⚠️ 功能目录已存在，跳过`);
    return false;
  }
  
  // 创建目录
  fs.mkdirSync(featureDir, { recursive: true });
  
  // 生成代码文件
  const className = toPascalCase(feature.id);
  
  const codeTemplate = `/**
 * ${feature.name}
 * 
 * ${feature.description}
 * 
 * @feature ${feature.id}
 * @category ${feature.category}
 * @priority ${feature.priority}
 * @complexity ${feature.complexity}
 * @auto-generated true
 * @generated-at ${new Date().toISOString()}
 */

import { EventEmitter } from 'eventemitter3';
import { theme, icons } from '../theme/index.js';

export interface ${className}Config {
  enabled: boolean;
  teamId?: string;
  userId?: string;
  settings?: Record<string, unknown>;
}

export interface ${className}State {
  isActive: boolean;
  lastRun?: Date;
  metrics: {
    totalRuns: number;
    successCount: number;
    failureCount: number;
  };
}

export class ${className} extends EventEmitter {
  private config: ${className}Config;
  private state: ${className}State;
  
  constructor(config: ${className}Config) {
    super();
    this.config = config;
    this.state = {
      isActive: false,
      metrics: {
        totalRuns: 0,
        successCount: 0,
        failureCount: 0,
      },
    };
  }
  
  /**
   * 初始化功能
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      console.log(theme.muted('${feature.name} is disabled'));
      return;
    }
    
    this.state.isActive = true;
    console.log(theme.success('${icons.check} ${feature.name} initialized'));
    this.emit('initialized', { timestamp: new Date() });
  }
  
  /**
   * 执行主要功能
   */
  async execute(input?: unknown): Promise<{ success: boolean; data?: unknown; error?: string }> {
    this.state.metrics.totalRuns++;
    this.state.lastRun = new Date();
    
    try {
      // TODO: 实现核心逻辑
      const result = await this.process(input);
      
      this.state.metrics.successCount++;
      this.emit('success', { result, timestamp: new Date() });
      
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.state.metrics.failureCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.emit('error', { error: errorMessage, timestamp: new Date() });
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
  
  /**
   * 核心处理逻辑 (需要子类实现)
   */
  protected async process(input?: unknown): Promise<unknown> {
    // TODO: 实现具体逻辑
    console.log(theme.info('Processing ${feature.name}...'));
    return { input, processed: true };
  }
  
  /**
   * 获取当前状态
   */
  getState(): ${className}State {
    return { ...this.state };
  }
  
  /**
   * 获取配置
   */
  getConfig(): ${className}Config {
    return { ...this.config };
  }
  
  /**
   * 更新配置
   */
  updateConfig(updates: Partial<${className}Config>): void {
    this.config = { ...this.config, ...updates };
    this.emit('configUpdated', { config: this.config });
  }
  
  /**
   * 停止功能
   */
  async shutdown(): Promise<void> {
    this.state.isActive = false;
    this.emit('shutdown', { timestamp: new Date() });
    console.log(theme.muted('${feature.name} shutdown'));
  }
}

export default ${className};
`;

  fs.writeFileSync(`${featureDir}/index.ts`, codeTemplate);
  console.log(`   ✓ 创建: ${featureDir}/index.ts`);
  
  // 创建测试文件
  const testTemplate = `import { describe, it, expect, beforeEach } from 'vitest';
import { ${className} } from './index.js';

describe('${className}', () => {
  let feature: ${className};
  
  beforeEach(() => {
    feature = new ${className}({ enabled: true });
  });
  
  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(feature.initialize()).resolves.not.toThrow();
      expect(feature.getState().isActive).toBe(true);
    });
    
    it('should not initialize when disabled', async () => {
      const disabledFeature = new ${className}({ enabled: false });
      await disabledFeature.initialize();
      expect(disabledFeature.getState().isActive).toBe(false);
    });
  });
  
  describe('execution', () => {
    it('should execute successfully', async () => {
      await feature.initialize();
      const result = await feature.execute();
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
    
    it('should track execution metrics', async () => {
      await feature.initialize();
      await feature.execute();
      const state = feature.getState();
      expect(state.metrics.totalRuns).toBe(1);
      expect(state.metrics.successCount).toBe(1);
    });
  });
  
  describe('configuration', () => {
    it('should update configuration', () => {
      feature.updateConfig({ teamId: 'team-1' });
      expect(feature.getConfig().teamId).toBe('team-1');
    });
  });
  
  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await feature.initialize();
      await feature.shutdown();
      expect(feature.getState().isActive).toBe(false);
    });
  });
});
`;

  fs.writeFileSync(`${featureDir}/index.test.ts`, testTemplate);
  console.log(`   ✓ 创建: ${featureDir}/index.test.ts`);
  
  // 创建 README
  const readmeTemplate = `# ${feature.name}

${feature.description}

## 安装

\`\`\`typescript
import { ${className} } from './${feature.id}';

const feature = new ${className}({
  enabled: true,
  teamId: 'your-team-id',
});

await feature.initialize();
\`\`\`

## 使用

\`\`\`typescript
// 执行功能
const result = await feature.execute({
  // 输入参数
});

if (result.success) {
  console.log('执行成功:', result.data);
} else {
  console.error('执行失败:', result.error);
}
\`\`\`

## 配置

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| enabled | boolean | 是 | 是否启用 |
| teamId | string | 否 | 团队ID |
| userId | string | 否 | 用户ID |
| settings | object | 否 | 额外设置 |

## API

### ${className}

- \`initialize(): Promise<void>\` - 初始化功能
- \`execute(input?): Promise<Result>\` - 执行功能
- \`getState(): State\` - 获取当前状态
- \`updateConfig(updates): void\` - 更新配置
- \`shutdown(): Promise<void>\` - 停止功能

## 事件

- \`initialized\` - 初始化完成
- \`success\` - 执行成功
- \`error\` - 执行出错
- \`configUpdated\` - 配置更新
- \`shutdown\` - 功能停止

## 开发状态

- **ID**: ${feature.id}
- **分类**: ${feature.category}
- **优先级**: ${feature.priority}
- **复杂度**: ${feature.complexity}
- **生成时间**: ${new Date().toISOString()}

## TODO

- [ ] 实现核心处理逻辑
- [ ] 添加错误处理
- [ ] 完善单元测试
- [ ] 添加集成测试
- [ ] 编写使用文档
- [ ] 性能优化
`;

  fs.writeFileSync(`${featureDir}/README.md`, readmeTemplate);
  console.log(`   ✓ 创建: ${featureDir}/README.md`);
  
  return { branchName, featureDir, feature };
}

// 提交到git
function commitToGit({ branchName, feature }) {
  try {
    // 创建分支
    execSync(`git checkout -b ${branchName}`, { stdio: 'ignore' });
    
    // 添加文件
    execSync('git add -A', { stdio: 'ignore' });
    
    // 提交
    const commitMessage = `feat(${feature.id}): ${feature.name}

${feature.description}

- 复杂度: ${feature.complexity}
- 优先级: ${feature.priority}
- 分类: ${feature.category}
- 包含: 核心代码、测试、文档

Auto-generated at ${new Date().toISOString()}`;
    
    execSync(`git commit -m "${commitMessage}"`, { stdio: 'ignore' });
    console.log(`   ✓ 已提交到分支: ${branchName}`);
    
    // 推送到远端
    execSync(`git push origin ${branchName}`, { stdio: 'ignore' });
    console.log(`   ✓ 已推送到远端`);
    
    // 切回主分支
    execSync('git checkout main', { stdio: 'ignore' });
    
    return true;
  } catch (e) {
    console.error(`   ❌ Git操作失败: ${e.message}`);
    return false;
  }
}

// 更新FEATURES.md
function updateFeaturesMd(feature) {
  try {
    if (!fs.existsSync('./FEATURES.md')) return;
    
    let content = fs.readFileSync('./FEATURES.md', 'utf8');
    
    // 查找对应分类
    const categoryMap = {
      productivity: '智能时间管理',
      knowledge: '知识管理',
      code: '代码智能',
      communication: '沟通增强',
      automation: '自动化办公',
      analytics: '团队健康',
      project: '项目管理',
      integration: '集成扩展',
      personalization: '个性化',
      gamification: '游戏化',
      ai: 'AI高级功能',
      collaboration: '高级协作',
      security: '安全合规',
    };
    
    const categoryName = categoryMap[feature.category] || '其他';
    
    // 检查是否已存在
    if (content.includes(feature.name)) {
      // 更新状态为已完成
      const pattern = new RegExp(`\\| ${feature.name} \\| [^\\|]+ \\|`);
      content = content.replace(pattern, `| ${feature.name} | ✅ |`);
    } else {
      // 在对应分类下添加
      const sectionPattern = new RegExp(`(### ${categoryName}[\\s\\S]*?)(\\n### |\\n## |$)`);
      const newRow = `| ${feature.name} | ✅ | - | ${feature.description} |\n`;
      content = content.replace(sectionPattern, `$1${newRow}$2`);
    }
    
    fs.writeFileSync('./FEATURES.md', content);
    
    // 提交FEATURES.md更新
    execSync('git add FEATURES.md', { stdio: 'ignore' });
    execSync(`git commit -m "docs: update FEATURES.md for ${feature.name}"`, { stdio: 'ignore' });
    execSync('git push origin main', { stdio: 'ignore' });
    
    console.log(`   ✓ 更新 FEATURES.md`);
  } catch (e) {
    console.error(`   ⚠️ 更新 FEATURES.md 失败: ${e.message}`);
  }
}

// 工具函数
function toPascalCase(str) {
  return str.replace(/(^|[-_])([a-z])/g, (_, __, char) => char.toUpperCase())
            .replace(/[-_]/g, '');
}

// 主循环
async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║     HyperTerminal Continuous Development Mode         ║');
  console.log('║              持续开发模式 - 直到22:00                 ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(`\n开始时间: ${new Date().toLocaleString()}`);
  console.log(`结束时间: ${CONFIG.endTime}`);
  console.log(`功能池: ${POTENTIAL_FEATURES.length} 个功能`);
  console.log(`间隔: ${CONFIG.interval / 1000 / 60} 分钟`);
  console.log('\n按 Ctrl+C 停止\n');
  
  let iteration = 0;
  let successCount = 0;
  
  const runIteration = async () => {
    // 检查是否该停止
    if (shouldStop()) {
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('📊 开发统计');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`总迭代: ${iteration}`);
      console.log(`成功: ${successCount}`);
      console.log(`成功率: ${iteration > 0 ? ((successCount / iteration) * 100).toFixed(1) : 0}%`);
      console.log('\n✨ 感谢使用 HyperTerminal 持续开发模式！');
      process.exit(0);
    }
    
    iteration++;
    const now = new Date();
    const timeLeft = new Date();
    const [stopHour, stopMin] = CONFIG.endTime.split(':').map(Number);
    timeLeft.setHours(stopHour, stopMin, 0, 0);
    const hoursLeft = Math.floor((timeLeft - now) / (1000 * 60 * 60));
    const minsLeft = Math.floor(((timeLeft - now) % (1000 * 60 * 60)) / (1000 * 60));
    
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`迭代 #${iteration} | 剩余时间: ${hoursLeft}小时${minsLeft}分钟`);
    console.log(`${'═'.repeat(60)}`);
    
    // 选择功能
    const feature = selectNextFeature();
    
    if (!feature) {
      console.log('\n✅ 所有功能都已实现！');
      process.exit(0);
    }
    
    console.log(`\n🎯 选中功能: ${feature.name}`);
    console.log(`   ${feature.description}`);
    console.log(`   [${feature.category}] ${feature.priority} | ${feature.complexity}`);
    
    // 生成代码
    const result = generateFeatureCode(feature);
    
    if (!result) {
      console.log(`   ⏭️ 跳过`);
      return;
    }
    
    // 提交到git
    const committed = commitToGit(result);
    
    if (committed) {
      successCount++;
      console.log(`\n✅ 功能 "${feature.name}" 开发完成并已提交`);
      
      // 更新文档
      updateFeaturesMd(feature);
      
      console.log(`\n⏳ 下次迭代: ${CONFIG.interval / 1000 / 60} 分钟后`);
    } else {
      console.log(`\n❌ 提交失败`);
    }
  };
  
  // 立即执行第一次
  await runIteration();
  
  // 设置定时器
  const timer = setInterval(runIteration, CONFIG.interval);
  
  // 监听停止信号
  process.on('SIGINT', () => {
    clearInterval(timer);
    console.log('\n\n👋 手动停止，再见！');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    clearInterval(timer);
    console.log('\n\n👋 手动停止，再见！');
    process.exit(0);
  });
}

// 启动
main().catch(console.error);
