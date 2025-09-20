import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

type Mode = 'dev' | 'full';

export interface MCPClientOptions {
  mode: Mode;
  command?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
}

export interface ToolCallDefinition {
  tool: string;
  args?: Record<string, unknown>;
}

export interface ToolCallStepResult {
  index: number;
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface ToolCallBatchResult {
  results: ToolCallStepResult[];
  completed: boolean;
  failureIndex?: number;
}

export class MCPTestClient {
  private client: Client;
  private transport: StdioClientTransport;
  private mode: Mode;

  constructor(options: MCPClientOptions) {
    this.mode = options.mode;
    const command = options.command ?? process.execPath; // node executable
    const tsxCli = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.cjs');
    const serverEntry = path.resolve(process.cwd(), 'src/index.ts');
    const args = options.args ?? [tsxCli, serverEntry];
    const baseEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries({ ...process.env, ...options.env })) {
      if (typeof v === 'string') baseEnv[k] = v;
    }
    baseEnv['MCP_MODE'] = options.mode;

    this.transport = new StdioClientTransport({ command, args, env: baseEnv });
    this.client = new Client(
      { name: 'mcp-e2e-client', version: '0.1.0' },
      {
        capabilities: { tools: {} },
      }
    );
  }

  async connect(): Promise<void> {
    await this.client.connect(this.transport);
  }

  async listTools(): Promise<string[]> {
    const res = await this.client.listTools({});
    return (res.tools ?? []).map((t) => t.name);
  }

  async callTool<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const res: { content?: Array<{ type: string; text?: string }> } = (await this.client.callTool({
      name,
      arguments: args,
    })) as { content?: Array<{ type: string; text?: string }> };
    const first = res.content?.[0];
    if (first != null && first.type === 'text' && typeof first.text === 'string') {
      try {
        return JSON.parse(first.text) as T;
      } catch {
        return first.text as unknown as T;
      }
    }
    return {} as T;
  }

  async callToolsBatch(steps: ToolCallDefinition[]): Promise<ToolCallBatchResult> {
    const results: ToolCallStepResult[] = [];
    let failureIndex: number | undefined;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      const args = step.args ?? {};
      try {
        const result = await this.callTool(step.tool, args);
        const ok = this.isSuccessfulResult(result);
        results.push({ index: i, tool: step.tool, args, ok, result });
        if (!ok) {
          failureIndex = i;
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ index: i, tool: step.tool, args, ok: false, error: message });
        failureIndex = i;
        break;
      }
    }

    return {
      results,
      completed: failureIndex === undefined && results.length === steps.length,
      failureIndex,
    };
  }

  async close(): Promise<void> {
    await this.transport.close();
  }

  getMode(): Mode {
    return this.mode;
  }

  private isSuccessfulResult(result: unknown): boolean {
    if (
      typeof result === 'object' &&
      result !== null &&
      'success' in (result as Record<string, unknown>)
    ) {
      return Boolean((result as { success?: unknown }).success);
    }
    return true;
  }
}
