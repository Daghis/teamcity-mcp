import { spawn } from 'child_process';
import path from 'path';

export type Mode = 'dev' | 'full';

export interface ToolBatchStep {
  tool: string;
  args?: Record<string, unknown>;
}

export interface ToolBatchStepResult {
  index: number;
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface ToolBatchResult {
  results: ToolBatchStepResult[];
  completed: boolean;
  failureIndex?: number;
}

export async function listTools(mode: Mode): Promise<string[]> {
  const res = (await runE2E(['tools', '--mode', mode])) as { tools?: string[] };
  return res.tools ?? [];
}

export async function callTool<T = unknown>(
  mode: Mode,
  name: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const res = (await runE2E(['call', name, JSON.stringify(args), '--mode', mode])) as {
    res: T;
  };
  return res.res;
}

export async function callToolsBatch(mode: Mode, steps: ToolBatchStep[]): Promise<ToolBatchResult> {
  const res = (await runE2E(['batch', JSON.stringify(steps), '--mode', mode])) as {
    results?: ToolBatchStepResult[];
    completed?: boolean;
    failureIndex?: number;
  };
  const results = res.results ?? [];
  const completed =
    res.completed ?? (results.length === steps.length && results.every((step) => step.ok));

  return { results, completed, failureIndex: res.failureIndex };
}

async function runE2E(args: string[]): Promise<unknown> {
  const tsx = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.cjs');
  const entry = path.resolve(process.cwd(), 'tests/e2e/index.ts');
  const child = spawn(process.execPath, [tsx, entry, ...args], {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    child.stdout.on('data', (c) => out.push(c));
    child.stderr.on('data', (c) => err.push(c));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        // eslint-disable-next-line no-console
        console.error(Buffer.concat(err).toString('utf8'));
        reject(new Error(`E2E CLI exited with ${code}`));
      } else resolve();
    });
  });
  const outStr = Buffer.concat(out).toString('utf8');
  // Attempt robust parse: walk lines from bottom up and parse the first valid JSON line
  const lines = outStr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? '';
    if (!line.startsWith('{') || !line.endsWith('}')) continue;
    try {
      return JSON.parse(line as string) as unknown;
    } catch {
      // continue
    }
  }
  throw new Error(`Failed to parse E2E output as JSON. Output:\n${outStr}`);
}
