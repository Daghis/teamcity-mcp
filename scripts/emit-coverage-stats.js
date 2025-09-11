#!/usr/bin/env node
/* Emit TeamCity buildStatisticValue messages from coverage/coverage-summary.json */
const fs = require('fs');
const path = require('path');

function esc(val) {
  const s = String(val);
  return s
    .replace(/\|/g, '||')
    .replace(/\[/g, '|[')
    .replace(/\]/g, '|]')
    .replace(/'/g, "|'")
    .replace(/\n/g, '|n');
}

try {
  const file = path.resolve(process.cwd(), 'coverage', 'coverage-summary.json');
  const raw = fs.readFileSync(file, 'utf8');
  const json = JSON.parse(raw);
  const t = json.total || {};
  const pairs = [
    ['CoverageLines', t.lines?.pct],
    ['CoverageBranches', t.branches?.pct],
    ['CoverageFunctions', t.functions?.pct],
    ['CoverageStatements', t.statements?.pct],
  ];
  for (const [k, v] of pairs) {
    if (v == null) continue;
    // TeamCity requires single-quoted values with escaping
    process.stdout.write(
      `##teamcity[buildStatisticValue key='${esc(k)}' value='${esc(v)}']\n`
    );
  }
  process.exit(0);
} catch (e) {
  const msg = esc(e && e.message ? e.message : String(e));
  process.stdout.write(
    `##teamcity[message text='Skipping coverage stats: ${msg}' status='WARNING']\n`
  );
  process.exit(0);
}

