#!/usr/bin/env node
/*
 Generates THIRD_PARTY_NOTICES.md from installed packages.
 Reads direct deps and devDeps from package.json and extracts
 name, version, and license from node_modules/<pkg>/package.json.
*/
const fs = require('fs');
const path = require('path');

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function pkgInfo(name) {
  try {
    const p = path.join('node_modules', ...name.split('/'));
    const data = readJSON(path.join(p, 'package.json'));
    // Normalize license string
    let license = 'UNKNOWN';
    if (typeof data.license === 'string') license = data.license;
    else if (data.license && typeof data.license.type === 'string') license = data.license.type;
    else if (Array.isArray(data.licenses) && data.licenses.length && data.licenses[0].type)
      license = data.licenses[0].type;
    return { name, version: data.version || 'UNKNOWN', license };
  } catch {
    return { name, version: 'UNKNOWN', license: 'UNKNOWN' };
  }
}

function generate() {
  const pkg = readJSON(path.join(process.cwd(), 'package.json'));
  const prod = Object.keys(pkg.dependencies || {}).sort().map(pkgInfo);
  const dev = Object.keys(pkg.devDependencies || {}).sort().map(pkgInfo);

  const lines = [];
  lines.push('# Third-Party Notices');
  lines.push('');
  lines.push(
    'This project includes third-party software. The following lists the direct dependencies and their licenses as resolved in this workspace. For full license texts, see each package’s own repository or the copies included in `node_modules/<package>/LICENSE` when present.'
  );
  lines.push('');
  lines.push(
    'If a dependency is not currently installed in `node_modules`, its version or license may be shown as UNKNOWN below; consult the package’s metadata for definitive terms.'
  );
  lines.push('');
  const now = new Date();
  const isoDate = now.toISOString().slice(0, 10);
  lines.push(`Last updated: ${isoDate}`);
  lines.push('');

  lines.push('## Production Dependencies');
  lines.push('');
  for (const i of prod) lines.push(`- ${i.name} ${i.version} — ${i.license}`);
  lines.push('');

  lines.push('## Development Dependencies');
  lines.push('');
  for (const i of dev) lines.push(`- ${i.name} ${i.version} — ${i.license}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(
    'Note: This document is provided for convenience and does not modify any license terms. All third-party packages remain the property of their respective copyright holders and are licensed under their own terms.'
  );
  lines.push('');

  fs.writeFileSync('THIRD_PARTY_NOTICES.md', lines.join('\n'));
}

generate();

