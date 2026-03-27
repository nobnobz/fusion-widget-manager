import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface PerformanceMetric {
  budget: number;
  metric: string;
  scenario: string;
  unit: 'count' | 'ms';
  value: number;
}

const metrics: PerformanceMetric[] = [];

export function recordPerformanceMetric(metric: PerformanceMetric) {
  metrics.push(metric);
}

function toMarkdown(rows: PerformanceMetric[]) {
  const header = '| Scenario | Metric | Value | Budget | Status |\n| --- | --- | ---: | ---: | --- |';
  const body = rows
    .map((row) => {
      const status = row.value <= row.budget ? 'pass' : 'fail';
      return `| ${row.scenario} | ${row.metric} | ${row.value}${row.unit} | ${row.budget}${row.unit} | ${status} |`;
    })
    .join('\n');

  return `${header}\n${body}\n`;
}

export function flushPerformanceReport() {
  const jsonPath = 'test/reports/generated/perf-baseline.json';
  const markdownPath = 'test/reports/generated/perf-baseline.md';

  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), metrics }, null, 2)}\n`);
  writeFileSync(markdownPath, toMarkdown(metrics));
}
