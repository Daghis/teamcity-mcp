import { z } from 'zod';

import { runTool, text } from '@/utils/mcp';

describe('runTool wrapper', () => {
  it('validates input with schema and returns success content', async () => {
    const schema = z.object({ n: z.number().int() });
    const handler = async (_args: { n: number }) => text('ok');

    const res = await runTool('test_tool', schema, handler, { n: 1 });

    expect(res.content?.[0]?.text).toBe('ok');
  });

  it('formats validation errors via global error handler', async () => {
    const schema = z.object({ n: z.number().int() });
    const handler = async (_args: { n: number }) => text('ok');

    const res = await runTool('test_tool', schema, handler, { n: 'oops' });

    // Response content is JSON-encoded error from global handler
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.success).toBe(false);
    expect(payload.error?.code).toBe('VALIDATION_ERROR');
  });

  it('formats thrown errors via global error handler', async () => {
    const schema = z.object({});
    const handler = async () => {
      throw new Error('boom');
    };

    const res = await runTool('test_tool', schema, handler, {});
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.success).toBe(false);
    expect(payload.error?.code).toBeDefined();
  });
});
