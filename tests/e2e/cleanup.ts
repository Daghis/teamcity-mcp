#!/usr/bin/env node
import { MCPTestClient } from './mcp-client';

function parseArgs(argv: string[]): { pattern: string; olderThanHours: number } {
  const args = argv.slice(2);
  let pattern = '^(E2E|MCP_E2E)';
  let olderThanHours = 2;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--pattern' && i + 1 < args.length) pattern = args[++i] ?? pattern;
    else if ((a === '--older-than-hours' || a === '--hours') && i + 1 < args.length) {
      const next = args[++i] ?? String(olderThanHours);
      const parsed = parseInt(next, 10);
      olderThanHours = Number.isNaN(parsed) ? olderThanHours : parsed;
    }
  }
  return { pattern, olderThanHours };
}

function extractTimestamp(str: string): number | null {
  const m = str.match(/(\d{13})$/);
  const ts = m?.[1];
  if (typeof ts === 'string') return parseInt(ts, 10);
  return null;
}

/**
 * Safely create a RegExp from user input with validation.
 * Limits pattern length to prevent ReDoS attacks.
 */
function safeRegExp(pattern: string, maxLength = 200): RegExp {
  if (pattern.length > maxLength) {
    throw new Error(`Pattern too long (max ${maxLength} characters): ${pattern.slice(0, 50)}...`);
  }
  try {
    return new RegExp(pattern);
  } catch (e) {
    throw new Error(`Invalid regex pattern: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main(): Promise<void> {
  const { pattern, olderThanHours } = parseArgs(process.argv);
  const now = Date.now();
  const cutoff = now - olderThanHours * 3600 * 1000;
  const re = safeRegExp(pattern);

  const client = new MCPTestClient({ mode: 'full' });
  await client.connect();
  try {
    const list = await client.callTool('list_projects', { all: true, maxPages: 50 });
    const items: Array<{ id?: string; name?: string }> = (
      typeof list === 'object' && list !== null && 'items' in (list as Record<string, unknown>)
        ? (((list as { items?: unknown[] }).items as unknown[] | undefined) ?? [])
        : []
    ) as Array<{ id?: string; name?: string }>;
    const targets = items.filter((p) => {
      const id = String(p.id ?? '');
      const name = String(p.name ?? '');
      if (!re.test(id) && !re.test(name)) return false;
      const ts = extractTimestamp(name) ?? extractTimestamp(id);
      return ts != null ? ts < cutoff : true;
    });

    for (const p of targets) {
      const id = String(p.id ?? '');
      if (!id) continue;
      try {
        const res = await client.callTool('delete_project', { projectId: id });
        process.stdout.write(`Deleted project ${id}: ${JSON.stringify(res)}\n`);
      } catch (e) {
        process.stderr.write(`Failed to delete ${id}: ${String(e)}\n`);
      }
    }
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
