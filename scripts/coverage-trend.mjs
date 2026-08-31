#!/usr/bin/env node
import fs from 'node:fs';

const TARGET = Number(process.argv[2] || 70);
const HISTORY_FILE = 'coverage-trend-history.json';
const POINT_FILE = 'coverage-trend.json';
const REPORT_FILE = 'coverage-trend.md';

function readSummary(dir) {
  const file = `${dir}/coverage/coverage-summary.json`;
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).total || null;
  } catch {
    return null;
  }
}

function pct(total, metric) {
  if (!total || !total[metric] || typeof total[metric].pct !== 'number') return null;
  return Math.round(total[metric].pct * 100) / 100;
}

let history = [];
if (fs.existsSync(HISTORY_FILE)) {
  try {
    history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    if (!Array.isArray(history)) history = [];
  } catch {
    history = [];
  }
}

const backend = readSummary('coverage/backend');
const frontend = readSummary('coverage/frontend');

function combined(metric) {
  const values = [backend, frontend]
    .map((t) => pct(t, metric))
    .filter((v) => v !== null);
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}

const metrics = ['lines', 'statements', 'functions', 'branches'];
const point = {
  run: process.env.GITHUB_RUN_NUMBER || 'local',
  sha: (process.env.GITHUB_SHA || 'local').slice(0, 7),
  ref: process.env.GITHUB_REF_NAME || 'local',
  date: new Date().toISOString(),
  backend: Object.fromEntries(metrics.map((m) => [m, pct(backend, m)])),
  frontend: Object.fromEntries(metrics.map((m) => [m, pct(frontend, m)])),
};

point.combined = Object.fromEntries(metrics.map((m) => [m, combined(m)]));

history.push(point);
if (history.length > 100) history = history.slice(-100);

fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
fs.writeFileSync(POINT_FILE, JSON.stringify(point, null, 2));

// Build markdown report with trend deltas
const previous = history.length > 1 ? history[history.length - 2] : null;

function delta(current, prev) {
  if (current === null) return 'n/a';
  if (prev === null || prev === undefined) return `${current}% (baseline)`;
  const d = Math.round((current - prev) * 100) / 100;
  const arrow = d > 0 ? '🟢 +' : d < 0 ? '🔴 ' : '⚪ ';
  return `${current}% (${arrow}${d}%)`;
}

function statusIcon(value) {
  if (value === null) return '❓ no data';
  return value >= TARGET ? `✅ ${value}%` : `⚠️ ${value}% (target ${TARGET}%)`;
}

const lines = [
  '# 📈 Coverage Trend Report',
  '',
  `**Run:** #${point.run} | **Ref:** \`${point.ref}\` | **Commit:** ${point.sha}`,
  '',
  '| Metric | Backend | Frontend | Combined | vs Previous Run |',
  '|--------|---------|----------|----------|-----------------|',
];

for (const m of metrics) {
  lines.push(
    `| ${m} | ${statusIcon(point.backend[m])} | ${statusIcon(point.frontend[m])} | ${statusIcon(point.combined[m])} | ${delta(point.combined[m], previous && previous.combined ? previous.combined[m] : null)} |`
  );
}

lines.push('', `**Minimum threshold:** ${TARGET}%`, '');

if (history.length > 1) {
  const first = history[Math.max(0, history.length - 11)];
  const last = history[history.length - 1];
  if (first !== last && first.combined && last.combined && first.combined.lines !== null && last.combined.lines !== null) {
    const trend = Math.round((last.combined.lines - first.combined.lines) * 100) / 100;
    lines.push(`**Trend (last ${history.length - 1 - history.indexOf(first) + 1 > 1 ? 'up to 10 runs' : 'run'}):** line coverage ${trend >= 0 ? 'up' : 'down'} ${Math.abs(trend)}% since run #${first.run}`);
    lines.push('');
  }
}

lines.push('<details>');
lines.push('<summary>History (recent runs)</summary>');
lines.push('');
lines.push('| Run | Date | Lines % | Functions % | Branches % (combined) |');
lines.push('|-----|------|---------|-------------|----------------------|');
for (const h of history.slice(-15)) {
  lines.push(
    `| #${h.run} | ${h.date.slice(0, 10)} | ${h.combined.lines ?? 'n/a'} | ${h.combined.functions ?? 'n/a'} | ${h.combined.branches ?? 'n/a'} |`
  );
}
lines.push('', '</details>');

const report = lines.join('\n');
fs.writeFileSync(REPORT_FILE, report);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
}

console.log(report);
