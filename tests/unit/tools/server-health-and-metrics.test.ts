// Force dev mode for read-only tools
// Use required tool helper to avoid undefined checks

jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  // Metrics and health item tools are full-mode only
  getMCPMode: () => 'full',
}));

describe('tools: server health & metrics', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('get_server_info returns server info JSON', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const server = {
            getServerInfo: jest.fn(async () => ({
              data: { version: '2024.1', buildNumber: '99999' },
            })),
          };
          jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance: () => ({ server }) } }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('get_server_info').handler({});
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ version: '2024.1', buildNumber: '99999' });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('get_server_metrics returns metrics JSON', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const server = {
            getAllMetrics: jest.fn(async () => ({
              data: { metrics: [{ name: 'cpu.load', value: 0.5 }] },
            })),
          };
          jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance: () => ({ server }) } }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('get_server_metrics').handler({});
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ metrics: [{ name: 'cpu.load', value: 0.5 }] });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('list_server_health_items returns health items and get_server_health_item returns one item', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const health = {
            getHealthItems: jest.fn(async () => ({
              data: {
                healthItem: [
                  { id: 'A', severity: 'INFO' },
                  { id: 'B', severity: 'ERROR' },
                ],
              },
            })),
            getSingleHealthItem: jest.fn(async () => ({ data: { id: 'B', severity: 'ERROR' } })),
          };
          jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance: () => ({ health }) } }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          let res = await getRequiredTool('list_server_health_items').handler({
            locator: 'severity:ERROR',
          });
          let payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(Array.isArray(payload.healthItem)).toBe(true);

          res = await getRequiredTool('get_server_health_item').handler({ locator: 'id:B' });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ id: 'B', severity: 'ERROR' });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('list_server_health_items treats empty locator as no filter', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          let receivedLocator: string | undefined;
          const health = {
            getHealthItems: jest.fn(async (locator?: string) => {
              receivedLocator = locator as string | undefined;
              return { data: { healthItem: [] } };
            }),
          };
          jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance: () => ({ health }) } }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          await getRequiredTool('list_server_health_items').handler({ locator: '' });
          expect(receivedLocator).toBeUndefined();
          resolve();
        })().catch(reject);
      });
    });
  });

  it('list_server_health_items normalizes category:(ERROR) to category:ERROR', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          let receivedLocator: string | undefined;
          const health = {
            getHealthItems: jest.fn(async (locator?: string) => {
              receivedLocator = locator as string | undefined;
              return { data: { healthItem: [] } };
            }),
          };
          jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance: () => ({ health }) } }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          await getRequiredTool('list_server_health_items').handler({
            locator: 'category:(ERROR),muted:false',
          });
          expect(receivedLocator).toBe('category:ERROR,muted:false');
          resolve();
        })().catch(reject);
      });
    });
  });

  it('list_server_health_items falls back to client-side filtering on HTTP 400', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const http400 = Object.assign(new Error('HTTP 400'), { statusCode: 400 });
          const health = {
            getHealthItems: jest
              .fn()
              // First call with locator throws 400
              .mockImplementationOnce(async () => {
                throw http400;
              })
              // Fallback without locator returns full list
              .mockImplementationOnce(async () => ({
                data: {
                  healthItem: [
                    { id: 'A', severity: 'INFO', category: 'misc' },
                    { id: 'B', severity: 'ERROR', category: 'build' },
                  ],
                },
              })),
          };
          jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance: () => ({ health }) } }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('list_server_health_items').handler({
            locator: 'severity:ERROR',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload.count).toBe(1);
          expect(Array.isArray(payload.healthItem)).toBe(true);
          expect(payload.healthItem[0]).toMatchObject({ id: 'B', severity: 'ERROR' });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('check_availability_guard returns ok=false on ERRORs and warnings when flagged', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const health = {
            getHealthItems: jest.fn(async () => ({
              data: {
                healthItem: [
                  { id: 'B', severity: 'ERROR' },
                  { id: 'C', severity: 'WARNING' },
                ],
              },
            })),
          };
          jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance: () => ({ health }) } }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          let res = await getRequiredTool('check_availability_guard').handler({});
          let payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload.ok).toBe(false); // has ERROR

          // Re-mock to only warnings
          jest.resetModules();
          jest.isolateModules(() => {});
          const healthWarn = {
            getHealthItems: jest.fn(async () => ({
              data: { healthItem: [{ id: 'W', severity: 'WARNING' }] },
            })),
          };
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ health: healthWarn }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool: loadRequired } = require('@/tools');
          res = await loadRequired('check_availability_guard').handler({ failOnWarning: true });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload.ok).toBe(false); // fail on warnings
          resolve();
        })().catch(reject);
      });
    });
  });
});
