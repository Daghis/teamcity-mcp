import { z } from 'zod';

import { globalErrorHandler } from '@/middleware/global-error-handler';
import { type ToolResponse, runTool } from '@/utils/mcp';

const makeMockLogger = () => {
  const mock = {
    generateRequestId: jest.fn(() => '123-1'),
    logToolExecution: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    logTeamCityRequest: jest.fn(),
    logLifecycle: jest.fn(),
    child: jest.fn(),
  };
  mock.child.mockReturnValue(mock);
  return mock;
};

let sharedLogger: ReturnType<typeof makeMockLogger>;

jest.mock('@/utils/logger/index', () => ({
  getLogger: () => {
    sharedLogger ??= makeMockLogger();
    return sharedLogger;
  },
  get logger() {
    sharedLogger ??= makeMockLogger();
    return sharedLogger;
  },
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

sharedLogger ??= makeMockLogger();

jest.mock('@/middleware/error', () => ({
  formatError: jest.fn((err: unknown) => ({ kind: 'zod', message: String(err) })),
}));

jest.mock('@/middleware/global-error-handler', () => ({
  globalErrorHandler: {
    handleToolError: jest.fn((_err: unknown, _tool: string, _ctx?: unknown) => ({
      kind: 'generic',
      msg: 'handled',
    })),
  },
}));

describe('utils/mcp runTool', () => {
  it('runs tool successfully and logs execution (masks secrets)', async () => {
    const schema = z.object({ token: z.string(), n: z.number() });
    const handler = jest.fn(
      async (_args: { token: string; n: number }): Promise<ToolResponse> => ({
        success: true,
        content: [{ type: 'text', text: 'ok' }],
      })
    );

    const res = await runTool(
      'echo',
      schema,
      handler,
      { token: 'secret', n: 2 },
      {
        requestId: 'req-1',
      }
    );

    expect(res.success).toBe(true);
    expect(handler).toHaveBeenCalledWith({ token: 'secret', n: 2 });

    // Logger was called with masked token
    expect(sharedLogger.logToolExecution).toHaveBeenCalledWith(
      'echo',
      expect.objectContaining({ token: '***', n: 2 }),
      { success: true, error: undefined },
      expect.any(Number),
      expect.objectContaining({ requestId: 'req-1' })
    );
  });

  it('returns formatted Zod error output when validation fails', async () => {
    const schema = z.object({ n: z.number() });
    const handler = jest.fn();

    const out = await runTool('sum', schema, handler, { n: 'bad' });
    expect(out.success).toBe(true); // json() wrapper marks success true
    expect(out.content?.[0]?.text).toContain('zod');
    expect(handler).not.toHaveBeenCalled();
  });

  it('routes generic errors through globalErrorHandler and returns json result', async () => {
    const schema = z.object({ x: z.string() }).nullable();
    const handler = jest.fn(async () => {
      throw new Error('boom');
    });

    const out = await runTool('f', schema, handler, { x: '1' });
    expect(out.success).toBe(true);
    expect(out.content?.[0]?.text).toContain('handled');

    expect(globalErrorHandler.handleToolError).toHaveBeenCalled();
  });
});
