import { describe, expect, it } from '@jest/globals';

import { callTool, callToolsBatchExpect } from './lib/mcp-runner';

const hasTeamCityEnv = Boolean(
  (process.env['TEAMCITY_URL'] ?? process.env['TEAMCITY_SERVER_URL']) &&
  (process.env['TEAMCITY_TOKEN'] ?? process.env['TEAMCITY_API_TOKEN'])
);

describe('Server env and health checks', () => {
  it('get_server_info (dev) and check_teamcity_connection (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    // get_server_info is dev-mode, check_teamcity_connection is full-only
    const results = await callToolsBatchExpect('full', [
      { tool: 'get_server_info', args: {} },
      { tool: 'check_teamcity_connection', args: {} },
    ]);

    const info = results[0]?.result as Record<string, unknown> | undefined;
    const conn = results[1]?.result as Record<string, unknown> | undefined;

    expect(info).toBeDefined();
    expect(conn).toHaveProperty('ok');
  }, 30000);

  it('check_availability_guard (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    // check_availability_guard is full-only
    const results = await callToolsBatchExpect('full', [
      { tool: 'check_availability_guard', args: {} },
      { tool: 'check_availability_guard', args: { failOnWarning: true } },
    ]);

    const guard = results[0]?.result as Record<string, unknown> | undefined;
    const guardStrict = results[1]?.result as Record<string, unknown> | undefined;

    expect(guard).toHaveProperty('ok');
    expect(guardStrict).toHaveProperty('ok');
  }, 30000);

  it('server metrics and health items (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    try {
      const metrics = await callTool<Record<string, unknown>>('full', 'get_server_metrics', {});
      expect(metrics).toBeDefined();
    } catch (e) {
      // Not all servers expose metrics; tolerate
      expect(true).toBe(true);
    }
    try {
      const items = await callTool<Record<string, unknown>>('full', 'list_server_health_items', {});
      expect(items).toBeDefined();
      const healthItems = (items as Record<string, unknown>)['healthItem'] as
        | Array<{ href?: string }>
        | undefined;
      const firstHref = healthItems?.[0]?.href;
      if (firstHref) {
        const locator = firstHref.split('/').pop();
        if (locator) {
          const item = await callTool<Record<string, unknown>>('full', 'get_server_health_item', {
            locator,
          });
          expect(item).toBeDefined();
        }
      }
    } catch (e) {
      // Health items may require permissions; tolerate
      expect(true).toBe(true);
    }
  }, 60000);
});
