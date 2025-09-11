#!/usr/bin/env node
import { MCPTestClient } from './mcp-client';

type Mode = 'dev' | 'full' | 'both';

interface CLIArgs {
  mode: Mode;
  cmd: 'smoke' | 'tools' | 'call';
  tool?: string;
  json?: string;
}

function parseArgs(argv: string[]): CLIArgs {
  const args = argv.slice(2);
  let mode: Mode = 'both';
  let cmd: CLIArgs['cmd'] = 'smoke';
  let tool: string | undefined;
  let json: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--mode' && i + 1 < args.length) {
      const m = args[++i] as Mode;
      mode = m;
    } else if (a === 'smoke' || a === 'tools' || a === 'call') {
      cmd = a;
    } else if (!tool) {
      tool = a;
    } else if (!json) {
      json = a;
    }
  }
  return { mode, cmd, tool, json };
}

async function runTools(mode: Exclude<Mode, 'both'>): Promise<void> {
  const client = new MCPTestClient({ mode });
  await client.connect();
  const tools = await client.listTools();
  console.log(JSON.stringify({ mode, tools }));
  await client.close();
}

async function runCall(mode: Exclude<Mode, 'both'>, tool: string, json?: string): Promise<void> {
  const client = new MCPTestClient({ mode });
  await client.connect();
  let args: Record<string, unknown> = {};
  if (json) {
    try {
      args = JSON.parse(json);
    } catch (e) {
      console.error('Invalid JSON for args:', e);
      process.exit(2);
    }
  }
  try {
    const res = await client.callTool(tool, args);
    console.log(JSON.stringify({ mode, tool, args, res }));
  } catch (e) {
    console.error(JSON.stringify({ mode, tool, args, error: String(e) }, null, 2));
    throw e;
  } finally {
    await client.close();
  }
}

async function runSmoke(mode: Exclude<Mode, 'both'>): Promise<void> {
  const client = new MCPTestClient({ mode });
  await client.connect();

  const tools = await client.listTools();
  const isDev = mode === 'dev';

  const pong = await client.callTool<string>('ping', { message: 'e2e' });
  console.log(JSON.stringify({ mode, step: 'ping', pong }));

  if (isDev) {
    const shouldNotExist = [
      'create_project',
      'update_project_settings',
      'delete_project',
      'create_build_config',
      'clone_build_config',
      'update_build_config',
      'set_build_configs_paused',
      'manage_build_steps',
      'manage_build_triggers',
      'add_parameter',
      'update_parameter',
      'delete_parameter',
      'create_vcs_root',
      'add_vcs_root_to_build',
      'authorize_agent',
      'assign_agent_to_pool',
      'set_agent_enabled',
      'bulk_set_agents_enabled',
      'move_queued_build_to_top',
      'reorder_queued_builds',
      'cancel_queued_builds_for_build_type',
      'cancel_queued_builds_by_locator',
      'pause_queue_for_pool',
      'resume_queue_for_pool',
      'get_server_metrics',
      'list_server_health_items',
      'get_server_health_item',
    ];
    for (const name of shouldNotExist) {
      const exists = tools.includes(name);
      console.log(JSON.stringify({ mode, step: 'tool_visibility', tool: name, exists }));
    }
  } else {
    const ts = Date.now();
    const projectId = `MCP_E2E_${ts}`;
    const projectName = `MCP E2E ${ts}`;
    const created = await client.callTool('create_project', {
      id: projectId,
      name: projectName,
      description: 'Temporary project for MCP e2e tests',
    });
    process.stdout.write(`${JSON.stringify({ mode, step: 'create_project', created })}\n`);

    const listed = await client.callTool('list_projects', { locator: `id:${projectId}` });
    const listedCount =
      typeof listed === 'object' &&
      listed !== null &&
      'items' in (listed as Record<string, unknown>)
        ? Array.isArray((listed as { items?: unknown[] }).items)
          ? ((listed as { items?: unknown[] }).items as unknown[]).length
          : 0
        : 0;
    process.stdout.write(`${JSON.stringify({ mode, step: 'list_projects', listedCount })}\n`);

    const deleted = await client.callTool('delete_project', { projectId });
    process.stdout.write(`${JSON.stringify({ mode, step: 'delete_project', deleted })}\n`);
  }

  await client.close();
}

async function main(): Promise<void> {
  const { mode, cmd, tool, json } = parseArgs(process.argv);

  const runFor = async (m: Exclude<Mode, 'both'>) => {
    if (cmd === 'tools') return runTools(m);
    if (cmd === 'call') {
      if (!tool) {
        console.error('Usage: e2e call <toolName> <jsonArgs> [--mode dev|full]');
        process.exit(2);
      }
      return runCall(m, tool, json);
    }
    return runSmoke(m);
  };

  if (mode === 'both') {
    await runFor('dev');
    await runFor('full');
  } else {
    await runFor(mode);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
