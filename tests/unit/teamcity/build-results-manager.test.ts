import { BuildResultsManager } from '@/teamcity/build-results-manager';
import type { TeamCityUnifiedClient } from '@/teamcity/types/client';

jest.mock('@/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const createManager = () =>
  new BuildResultsManager({
    getApiConfig: () => ({ baseUrl: 'https://teamcity.example/' }),
    modules: {
      builds: {
        downloadFileOfBuild: jest.fn(),
      },
    },
  } as unknown as TeamCityUnifiedClient);

describe('BuildResultsManager utilities', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('buildAbsoluteUrl normalizes relative paths', () => {
    const manager = createManager();
    const internals = manager as unknown as {
      buildAbsoluteUrl: (path: string) => string;
    };

    expect(internals.buildAbsoluteUrl('https://external.example/build')).toBe(
      'https://external.example/build'
    );
    expect(internals.buildAbsoluteUrl('/app/rest/builds')).toBe(
      'https://teamcity.example/app/rest/builds'
    );
    expect(internals.buildAbsoluteUrl('app/rest/builds')).toBe(
      'https://teamcity.example/app/rest/builds'
    );
  });

  it('parseTeamCityDate handles canonical and ISO formats', () => {
    const manager = createManager();
    const internals = manager as unknown as {
      parseTeamCityDate: (value: string) => number;
    };

    const canonical = internals.parseTeamCityDate('20250112T121314+0000');
    expect(canonical).toBe(new Date(2025, 0, 12, 12, 13, 14).getTime());

    const iso = internals.parseTeamCityDate('2025-01-12T12:13:14.000Z');
    expect(iso).toBe(Date.parse('2025-01-12T12:13:14.000Z'));
  });

  it('getCacheKey combines build id and options', () => {
    const manager = createManager();
    const internals = manager as unknown as {
      getCacheKey: (id: string, options: Record<string, unknown>) => string;
    };

    expect(internals.getCacheKey('123', { includeArtifacts: true })).toBe(
      '123:{"includeArtifacts":true}'
    );
  });

  it('isAxiosNotFound detects axios 404 errors', () => {
    const manager = createManager();
    const internals = manager as unknown as {
      isAxiosNotFound: (error: unknown) => boolean;
    };

    expect(internals.isAxiosNotFound({ response: { status: 404 } })).toBe(true);
    expect(internals.isAxiosNotFound({ response: { status: 500 } })).toBe(false);
    expect(internals.isAxiosNotFound({})).toBe(false);
  });

  it('caches results and expires them based on TTL', () => {
    const manager = createManager();
    const internals = manager as unknown as {
      cacheResult: (key: string, result: unknown) => void;
      getFromCache: (key: string) => unknown;
    };

    const cacheTtl = (BuildResultsManager as unknown as { cacheTtlMs: number }).cacheTtlMs;
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(0);

    internals.cacheResult('build:1', { build: { id: 1 } });
    expect(internals.getFromCache('build:1')).toEqual({ build: { id: 1 } });

    nowSpy.mockReturnValue(cacheTtl + 1);
    expect(internals.getFromCache('build:1')).toBeNull();
  });

  it('cleanCache removes expired entries while preserving recent ones', () => {
    const manager = createManager();
    const internals = manager as unknown as {
      cacheResult: (key: string, result: unknown) => void;
      cleanCache: () => void;
      getFromCache: (key: string) => unknown;
    };

    const cacheTtl = (BuildResultsManager as unknown as { cacheTtlMs: number }).cacheTtlMs;
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(0);
    internals.cacheResult('old', { build: { id: 1 } });

    nowSpy.mockReturnValue(cacheTtl - 1000);
    internals.cacheResult('fresh', { build: { id: 2 } });

    nowSpy.mockReturnValue(cacheTtl + 1000);
    internals.cleanCache();

    expect(internals.getFromCache('old')).toBeNull();
    expect(internals.getFromCache('fresh')).toEqual({ build: { id: 2 } });
  });
});
