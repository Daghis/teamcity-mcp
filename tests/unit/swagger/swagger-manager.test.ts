import { SwaggerManager } from '@/swagger';
import { SwaggerCache } from '@/swagger/swagger-cache';
import { SwaggerFetcher, type SwaggerSpec } from '@/swagger/swagger-fetcher';
import { SwaggerValidator } from '@/swagger/swagger-validator';

jest.mock('@/config', () => ({
  getConfig: () => ({ teamcity: { url: 'https://teamcity.example.com', token: 't' } }),
}));

describe('SwaggerManager', () => {
  const spec: SwaggerSpec = {
    openapi: '3.0.0',
    info: { version: '2024.1', title: 'API' },
    paths: {},
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('returns cached spec when available', async () => {
    jest.spyOn(SwaggerCache.prototype, 'get').mockResolvedValueOnce(spec);
    const fetchSpy = jest.spyOn(SwaggerFetcher.prototype, 'fetchSpec');

    const mgr = new SwaggerManager({});
    const out = await mgr.getSpec();
    expect(out).toEqual(spec);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches, validates, warns, and caches when not cached', async () => {
    jest.spyOn(SwaggerCache.prototype, 'get').mockResolvedValueOnce(null as unknown as SwaggerSpec);
    jest.spyOn(SwaggerFetcher.prototype, 'fetchSpec').mockResolvedValueOnce(spec);
    jest
      .spyOn(SwaggerValidator.prototype, 'validateSpec')
      .mockReturnValueOnce({ isValid: true, teamCityVersion: '2024.1', version: '3.0.0' });
    const setSpy = jest.spyOn(SwaggerCache.prototype, 'set').mockResolvedValueOnce();

    const mgr = new SwaggerManager({});
    const out = await mgr.getSpec();
    expect(out).toEqual(spec);
    expect(setSpy).toHaveBeenCalled();
  });

  it('getServerInfo returns connectivity, version and specVersion', async () => {
    jest.spyOn(SwaggerFetcher.prototype, 'testConnection').mockResolvedValueOnce(true);
    jest.spyOn(SwaggerFetcher.prototype, 'getServerVersion').mockResolvedValueOnce('2024.1');
    jest.spyOn(SwaggerCache.prototype, 'get').mockResolvedValueOnce(spec);

    const mgr = new SwaggerManager({});
    const info = await mgr.getServerInfo();
    expect(info.connected).toBe(true);
    expect(info.version).toBe('2024.1');
    expect(info.specVersion).toBe('3.0.0');
  });

  it('getServerInfo handles spec fetch errors gracefully', async () => {
    jest.spyOn(SwaggerFetcher.prototype, 'testConnection').mockResolvedValueOnce(false);
    jest.spyOn(SwaggerFetcher.prototype, 'getServerVersion').mockResolvedValueOnce(null);
    jest.spyOn(SwaggerCache.prototype, 'get').mockResolvedValueOnce(null as unknown as SwaggerSpec);
    jest.spyOn(SwaggerFetcher.prototype, 'fetchSpec').mockRejectedValueOnce(new Error('x'));

    const mgr = new SwaggerManager({});
    const info = await mgr.getServerInfo();
    expect(info.connected).toBe(false);
    expect(info.version).toBeNull();
    expect(info.specVersion).toBeUndefined();
  });

  it('clearCache delegates to cache', async () => {
    const spy = jest.spyOn(SwaggerCache.prototype, 'clear').mockResolvedValueOnce();
    const mgr = new SwaggerManager({});
    await mgr.clearCache();
    expect(spy).toHaveBeenCalled();
  });

  it('getCacheStats delegates to cache', async () => {
    const stats = { size: 1, files: 1 };
    jest.spyOn(SwaggerCache.prototype, 'getStats').mockResolvedValueOnce(
      stats as unknown as {
        size: number;
        files: number;
      }
    );
    const mgr = new SwaggerManager({});
    await expect(mgr.getCacheStats()).resolves.toEqual(stats);
  });
});
