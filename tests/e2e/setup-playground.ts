#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { MCPTestClient } from './mcp-client';

function updateEnvFile(updates: Record<string, string>): void {
  const envPath = path.resolve(process.cwd(), '.env');
  let content = '';
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch {
    content = '';
  }
  const lines = content.split(/\r?\n/);
  const map = new Map<string, string>();
  for (const line of lines) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1);
    map.set(k, v);
  }
  for (const [k, v] of Object.entries(updates)) {
    map.set(k, v);
  }
  const out = Array.from(map.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  fs.writeFileSync(envPath, `${out}\n`, 'utf8');
}

async function main(): Promise<void> {
  const existingId = process.env['E2E_PROJECT_ID'];
  if (existingId) {
    process.stdout.write(`E2E_PROJECT_ID already set (${existingId}); skipping creation.\n`);
    return;
  }

  const ts = Date.now();
  const id = `E2E_MCP_${ts}`;
  const name = `E2E MCP ${ts}`;

  const client = new MCPTestClient({ mode: 'full' });
  await client.connect();
  try {
    await client.callTool('create_project', {
      id,
      name,
      description: 'Playground for MCP E2E tests (safe to modify)',
    });
    process.stdout.write(`Created playground project: ${id}\n`);
    updateEnvFile({ E2E_PROJECT_ID: id, E2E_PROJECT_NAME: name });
    const proj = await client.callTool('get_project', { projectId: id });
    process.stdout.write(`Verified project exists: ${JSON.stringify(proj).slice(0, 120)}...\n`);
  } catch (e) {
    process.stderr.write(`Failed to create playground: ${String(e)}\n`);
    throw e;
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  process.stderr.write(String(e));
  process.exit(1);
});
