#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const TARGET = Number(process.argv[2] || 70);
const summaryPath = path.resolve('coverage/coverage-summary.json');

if (!fs.existsSync(summaryPath)) {
  console.error(`::error::No coverage summary found at ${summaryPath}. Run tests with --coverage first.`);
  process.exit(1);
}

let summary;
try {
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
} catch (err) {
  console.error(`::error::Failed to parse coverage summary: ${err.message}`);
  process.exit(1);
}

const total = summary.total || {};
const metrics = ['lines', 'statements', 'functions', 'branches'];

let failed = false;
for (const metric of metrics) {
  const pct = total[metric] ? total[metric].pct : 0;
  if (pct < TARGET) {
    console.error(`::error::${metric} coverage ${pct}% is below the ${TARGET}% minimum threshold`);
    failed = true;
  } else {
    console.log(`✅ ${metric} coverage: ${pct}% (target ${TARGET}%)`);
  }
}

if (failed) {
  console.error(`❌ Coverage below the ${TARGET}% minimum. Add tests to raise coverage.`);
  process.exit(1);
}

console.log(`✅ All coverage metrics meet the ${TARGET}% minimum threshold`);
