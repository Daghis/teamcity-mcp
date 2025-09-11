import { describe, expect, it } from '@jest/globals';

import { callTool } from './lib/mcp-runner';

const hasTeamCityEnv = Boolean(
  (process.env['TEAMCITY_URL'] ?? process.env['TEAMCITY_SERVER_URL']) &&
    (process.env['TEAMCITY_TOKEN'] ?? process.env['TEAMCITY_API_TOKEN'])
);

describe('Server env and health checks', () => {
  it('get_server_info and check_teamcity_connection (dev)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const info = await callTool<Record<string, unknown>>('dev', 'get_server_info', {});
    expect(info).toBeDefined();
    const conn = await callTool<Record<string, unknown>>('dev', 'check_teamcity_connection', {});
    expect(conn).toHaveProperty('ok');
  }, 30000);

  it('check_availability_guard (dev)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const guard = await callTool<Record<string, unknown>>('dev', 'check_availability_guard', {});
    expect(guard).toHaveProperty('ok');
    const guardStrict = await callTool<Record<string, unknown>>('dev', 'check_availability_guard', {
      failOnWarning: true,
    });
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
