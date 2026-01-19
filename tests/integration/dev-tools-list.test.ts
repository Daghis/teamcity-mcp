import { describe, expect, it } from '@jest/globals';
import { spawn } from 'child_process';
import path from 'path';

const hasTeamCityEnv = Boolean(
  (process.env['TEAMCITY_URL'] ?? process.env['TEAMCITY_SERVER_URL']) &&
  (process.env['TEAMCITY_TOKEN'] ?? process.env['TEAMCITY_API_TOKEN'])
);

// Expected dev-mode tools as per docs/mcp-tools-mode-matrix.md
// Note: 29 dev-mode tools focused on developer workflows; admin/infrastructure tools moved to full mode
const EXPECTED_DEV_TOOLS = new Set([
  'ping',
  // Mode management
  'get_mcp_mode',
  'set_mcp_mode',
  // Projects
  'list_projects',
  'get_project',
  'list_project_hierarchy',
  // Builds
  'list_builds',
  'get_build',
  'trigger_build',
  'cancel_queued_build',
  'get_build_status',
  'fetch_build_log',
  'get_build_results',
  'download_build_artifact',
  'download_build_artifacts',
  'analyze_build_problems',
  // Changes & diagnostics
  'list_changes',
  'list_problems',
  'list_problem_occurrences',
  'list_investigations',
  'list_muted_tests',
  // Build Configs
  'list_build_configs',
  'get_build_config',
  // Tests
  'list_test_failures',
  'get_test_details',
  // Queue
  'list_queued_builds',
  // Server
  'get_server_info',
  // Branches & Params
  'list_branches',
  'list_parameters',
]);

describe('Dev mode tool surface', () => {
  it('matches the expected dev-mode tool set exactly', async () => {
    if (!hasTeamCityEnv) {
      return expect(true).toBe(true);
    }
    // Invoke the e2e CLI directly via tsx to avoid ESM import issues in tests
    const tsx = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.cjs');
    const entry = path.resolve(process.cwd(), 'tests/e2e/index.ts');
    const child = spawn(process.execPath, [tsx, entry, 'tools', '--mode', 'dev'], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      child.stdout.on('data', (c: Buffer) => chunks.push(c));
      const errs: Buffer[] = [];
      child.stderr.on('data', (c: Buffer) => errs.push(c));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) {
          console.error(Buffer.concat(errs).toString('utf8'));
          reject(new Error(`Process exited with code ${code}`));
        } else resolve();
      });
    });
    // Output is multiple JSON objects; take the last complete JSON block
    const out = Buffer.concat(chunks).toString('utf8');
    const matches = out.match(/\{[\s\S]*\}/g) ?? [];
    const last = matches[matches.length - 1] ?? '{}';
    const parsed = JSON.parse(last) as { tools?: string[] };
    const tools = parsed.tools ?? [];
    const actual = new Set(tools);
    // Compare symmetric difference for helpful diff on failure
    const missing = [...EXPECTED_DEV_TOOLS].filter((t) => !actual.has(t));
    const extra = [...actual].filter((t) => !EXPECTED_DEV_TOOLS.has(t));

    if (missing.length || extra.length) {
      // Provide readable assertion output

      console.error('Dev tools mismatch', { missing, extra, actual: tools });
    }

    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  }, 120000);
});
