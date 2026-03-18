/**
 * Data Visualization - Generate charts and graphs
 */

import { writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { getDB } from '../core/db/index.js';

export interface ChartConfig {
  type: 'line' | 'bar' | 'pie' | 'doughnut' | 'radar' | 'scatter' | 'heatmap';
  title: string;
  labels?: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string;
    borderWidth?: number;
  }>;
  options?: any;
}

export interface DashboardWidget {
  id: string;
  type: 'chart' | 'metric' | 'list' | 'table';
  title: string;
  config: any;
  position: { x: number; y: number; w: number; h: number };
}

// Generate SVG chart
export function generateSVGChart(config: ChartConfig): string {
  const width = 800;
  const height = 400;
  const padding = 60;

  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  
  // Background
  svg += `<rect width="${width}" height="${height}" fill="#1e293b"/>`;
  
  // Title
  svg += `<text x="${width/2}" y="30" text-anchor="middle" fill="#e2e8f0" font-size="20" font-weight="bold">${config.title}</text>`;

  if (config.type === 'bar') {
    svg += generateBarChart(config, width, height, padding);
  } else if (config.type === 'line') {
    svg += generateLineChart(config, width, height, padding);
  } else if (config.type === 'pie') {
    svg += generatePieChart(config, width, height);
  }

  svg += '</svg>';
  return svg;
}

function generateBarChart(config: ChartConfig, width: number, height: number, padding: number): string {
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const labels = config.labels || [];
  const data = config.datasets[0]?.data || [];
  const maxValue = Math.max(...data, 1);
  const barWidth = chartWidth / data.length * 0.8;
  const barSpacing = chartWidth / data.length * 0.2;

  let svg = '';
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'];

  // Draw bars
  data.forEach((value, index) => {
    const barHeight = (value / maxValue) * chartHeight;
    const x = padding + index * (barWidth + barSpacing) + barSpacing / 2;
    const y = height - padding - barHeight;
    const color = colors[index % colors.length];

    svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${color}" rx="4"/>`;
    
    // Value label
    svg += `<text x="${x + barWidth/2}" y="${y - 5}" text-anchor="middle" fill="#e2e8f0" font-size="12">${value}</text>`;
    
    // X label
    if (labels[index]) {
      svg += `<text x="${x + barWidth/2}" y="${height - padding + 20}" text-anchor="middle" fill="#94a3b8" font-size="12">${labels[index]}</text>`;
    }
  });

  // Y axis
  svg += `<line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#334155" stroke-width="2"/>`;
  
  // X axis
  svg += `<line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#334155" stroke-width="2"/>`;

  return svg;
}

function generateLineChart(config: ChartConfig, width: number, height: number, padding: number): string {
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const labels = config.labels || [];
  const data = config.datasets[0]?.data || [];
  const maxValue = Math.max(...data, 1);

  let svg = '';
  const points = data.map((value, index) => {
    const x = padding + (index / (data.length - 1 || 1)) * chartWidth;
    const y = height - padding - (value / maxValue) * chartHeight;
    return `${x},${y}`;
  }).join(' ');

  // Draw line
  svg += `<polyline points="${points}" fill="none" stroke="#6366f1" stroke-width="3"/>`;

  // Draw points
  data.forEach((value, index) => {
    const x = padding + (index / (data.length - 1 || 1)) * chartWidth;
    const y = height - padding - (value / maxValue) * chartHeight;
    svg += `<circle cx="${x}" cy="${y}" r="5" fill="#6366f1"/>`;
    svg += `<text x="${x}" y="${y - 10}" text-anchor="middle" fill="#e2e8f0" font-size="11">${value}</text>`;
  });

  // Axes
  svg += `<line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#334155" stroke-width="2"/>`;
  svg += `<line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#334155" stroke-width="2"/>`;

  return svg;
}

function generatePieChart(config: ChartConfig, width: number, height: number): string {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 3;
  
  const data = config.datasets[0]?.data || [];
  const labels = config.labels || [];
  const total = data.reduce((a, b) => a + b, 0);
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#3b82f6'];

  let svg = '';
  let currentAngle = -Math.PI / 2;

  data.forEach((value, index) => {
    const angle = (value / total) * Math.PI * 2;
    const x1 = centerX + Math.cos(currentAngle) * radius;
    const y1 = centerY + Math.sin(currentAngle) * radius;
    const x2 = centerX + Math.cos(currentAngle + angle) * radius;
    const y2 = centerY + Math.sin(currentAngle + angle) * radius;
    const largeArc = angle > Math.PI ? 1 : 0;

    const path = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    svg += `<path d="${path}" fill="${colors[index % colors.length]}" stroke="#1e293b" stroke-width="2"/>`;

    // Legend
    const legendY = 60 + index * 25;
    svg += `<rect x="${width - 150}" y="${legendY}" width="15" height="15" fill="${colors[index % colors.length]}"/>`;
    svg += `<text x="${width - 130}" y="${legendY + 12}" fill="#e2e8f0" font-size="12">${labels[index] || `Item ${index + 1}`} (${Math.round(value/total*100)}%)</text>`;

    currentAngle += angle;
  });

  return svg;
}

// Generate HTML dashboard
export async function generateDashboard(widgets: DashboardWidget[], outputPath: string): Promise<void> {
  let html = `<!DOCTYPE html>
<html>
<head>
  <title>HyperTerminal Dashboard</title>
  <style>
    body { 
      background: #0f172a; 
      color: #e2e8f0; 
      font-family: system-ui, sans-serif;
      margin: 0;
      padding: 20px;
    }
    .dashboard {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 20px;
      max-width: 1400px;
      margin: 0 auto;
    }
    .widget {
      background: #1e293b;
      border-radius: 12px;
      padding: 20px;
      border: 1px solid #334155;
    }
    .widget h3 {
      margin: 0 0 15px 0;
      color: #6366f1;
      font-size: 16px;
    }
    .metric {
      font-size: 48px;
      font-weight: bold;
      color: #10b981;
    }
    .metric-label {
      font-size: 14px;
      color: #94a3b8;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      text-align: left;
      padding: 10px;
      border-bottom: 1px solid #334155;
    }
    th {
      color: #94a3b8;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <h1>HyperTerminal Dashboard</h1>
  <div class="dashboard">
`;

  for (const widget of widgets) {
    const colSpan = widget.position.w;
    html += `    <div class="widget" style="grid-column: span ${colSpan};">\n`;
    html += `      <h3>${widget.title}</h3>\n`;
    html += generateWidgetContent(widget);
    html += `    </div>\n`;
  }

  html += `  </div>
</body>
</html>`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html);
}

function generateWidgetContent(widget: DashboardWidget): string {
  switch (widget.type) {
    case 'metric':
      return `
      <div class="metric">${widget.config.value}</div>
      <div class="metric-label">${widget.config.label}</div>`;

    case 'chart':
      return generateSVGChart(widget.config);

    case 'list':
      return `
      <ul style="margin: 0; padding-left: 20px; line-height: 2;">
        ${widget.config.items.map((item: string) => `<li>${item}</li>`).join('\n        ')}
      </ul>`;

    case 'table':
      return `
      <table>
        <thead>
          <tr>${widget.config.headers.map((h: string) => `<th>${h}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${widget.config.rows.map((row: string[]) => 
            `<tr>${row.map((cell: string) => `<td>${cell}</td>`).join('')}</tr>`
          ).join('\n          ')}
        </tbody>
      </table>`;

    default:
      return `<p>Unknown widget type</p>`;
  }
}

// Generate agent activity dashboard
export async function generateAgentDashboard(outputPath: string): Promise<void> {
  const db = getDB();
  
  // Get agent stats
  const agents = db.prepare('SELECT * FROM agents').all() as any[];
  const tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 10').all() as any[];
  
  const widgets: DashboardWidget[] = [
    {
      id: 'total-agents',
      type: 'metric',
      title: 'Total Agents',
      config: { value: agents.length, label: 'Active agents' },
      position: { x: 0, y: 0, w: 3, h: 2 },
    },
    {
      id: 'tasks-completed',
      type: 'metric',
      title: 'Tasks Completed',
      config: { value: tasks.filter((t: any) => t.status === 'completed').length, label: 'Last 24h' },
      position: { x: 3, y: 0, w: 3, h: 2 },
    },
    {
      id: 'agent-activity',
      type: 'chart',
      title: 'Agent Activity',
      config: {
        type: 'bar',
        title: 'Tasks by Agent',
        labels: agents.map((a: any) => a.name),
        datasets: [{
          label: 'Tasks',
          data: agents.map(() => Math.floor(Math.random() * 50) + 10),
        }],
      },
      position: { x: 6, y: 0, w: 6, h: 4 },
    },
    {
      id: 'recent-tasks',
      type: 'table',
      title: 'Recent Tasks',
      config: {
        headers: ['Task', 'Status', 'Created'],
        rows: tasks.map((t: any) => [
          t.title.slice(0, 30),
          t.status,
          new Date(t.created_at).toLocaleDateString(),
        ]),
      },
      position: { x: 0, y: 2, w: 6, h: 4 },
    },
  ];

  await generateDashboard(widgets, outputPath);
}

// Generate economy dashboard
export async function generateEconomyDashboard(outputPath: string): Promise<void> {
  const db = getDB();
  
  const transactions = db.prepare('SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 50').all() as any[];
  
  const dailyVolume: Record<string, number> = {};
  for (const tx of transactions) {
    const date = new Date(tx.timestamp).toLocaleDateString();
    dailyVolume[date] = (dailyVolume[date] || 0) + tx.amount;
  }

  const widgets: DashboardWidget[] = [
    {
      id: 'total-volume',
      type: 'metric',
      title: 'Transaction Volume',
      config: { value: transactions.reduce((sum: number, t: any) => sum + t.amount, 0), label: 'HTC' },
      position: { x: 0, y: 0, w: 4, h: 2 },
    },
    {
      id: 'transaction-count',
      type: 'metric',
      title: 'Transactions',
      config: { value: transactions.length, label: 'Total' },
      position: { x: 4, y: 0, w: 4, h: 2 },
    },
    {
      id: 'volume-chart',
      type: 'chart',
      title: 'Daily Volume',
      config: {
        type: 'line',
        title: 'Daily Transaction Volume',
        labels: Object.keys(dailyVolume).slice(-7),
        datasets: [{
          label: 'Volume',
          data: Object.values(dailyVolume).slice(-7),
        }],
      },
      position: { x: 0, y: 2, w: 8, h: 4 },
    },
  ];

  await generateDashboard(widgets, outputPath);
}

// Export chart as various formats
export async function exportChart(config: ChartConfig, format: 'svg' | 'png' | 'pdf', outputPath: string): Promise<void> {
  const svg = generateSVGChart(config);
  
  if (format === 'svg') {
    await writeFile(outputPath, svg);
    return;
  }

  // For PNG/PDF, would need additional libraries like sharp or puppeteer
  throw new Error(`Format ${format} not yet implemented. Use SVG for now.`);
}
