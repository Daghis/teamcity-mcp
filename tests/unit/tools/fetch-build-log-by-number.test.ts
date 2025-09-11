import { getRequiredTool } from '@/tools';

// Mock TeamCity API client to support buildNumber resolution and chunk fetching
jest.mock('@/api-client', () => {
  const listBuilds = jest.fn(async (locator?: string) => {
    // Provide deterministic responses based on locator
    if (locator?.includes('buildType:(id:BT_ID)') && locator.includes('number:54')) {
      return { build: [{ id: 1189, buildTypeId: 'BT_ID' }] };
    }
    if (locator?.includes('number:55')) {
      // Single match without buildTypeId
      return { build: [{ id: 2001, buildTypeId: 'ANY' }] };
    }
    return { build: [] };
  });

  const getBuildLogChunk = jest.fn(
    (buildId?: string, opts?: { startLine?: number; lineCount?: number }) => {
      const lines: string[] = [
        `log for ${buildId} :: ${opts?.startLine ?? 0}-${(opts?.startLine ?? 0) + (opts?.lineCount ?? 500) - 1}`,
      ];
      return Promise.resolve({
        lines,
        startLine: opts?.startLine ?? 0,
        nextStartLine: undefined,
        totalLines: 1,
      });
    }
  );

  return {
    TeamCityAPI: {
      getInstance: () => ({
        listBuilds,
        getBuildLogChunk,
      }),
    },
  };
});

describe('fetch_build_log with buildNumber', () => {
  it('resolves buildId using buildNumber + buildTypeId and fetches chunk', async () => {
    const res = await getRequiredTool('fetch_build_log').handler({
      buildNumber: '54',
      buildTypeId: 'BT_ID',
      page: 1,
      pageSize: 2,
    });
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.meta.buildId).toBe('1189');
    expect(payload.meta.buildNumber).toBe('54');
    expect(Array.isArray(payload.lines)).toBe(true);
    expect(typeof payload.lines[0]).toBe('string');
  });

  it('resolves buildId using buildNumber alone when a single match exists', async () => {
    const res = await getRequiredTool('fetch_build_log').handler({
      buildNumber: 55,
      page: 1,
      pageSize: 5,
    });
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.meta.buildId).toBe('2001');
    expect(payload.meta.buildNumber).toBe('55');
  });
});
