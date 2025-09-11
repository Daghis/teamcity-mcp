import { getRequiredTool } from '@/tools';

// Mock TeamCity API client to simulate ambiguous and fallback scenarios
jest.mock('@/api-client', () => {
  const listBuilds = jest.fn(async (locator?: string) => {
    if (locator?.includes('number:77')) {
      // Ambiguous: two builds, no buildTypeId filter provided
      return { build: [{ id: 1001 }, { id: 1002 }] };
    }
    if (locator?.includes('buildType:(id:BT_FALLBACK)') && locator.includes('number:56')) {
      // Force fallback by returning empty for the direct locator
      return { build: [] };
    }
    if (locator === 'buildType:(id:BT_FALLBACK),branch:default:any,count:100') {
      // Fallback recent list contains the matching number
      return { build: [{ id: 2002, number: '56' }] };
    }
    return { build: [] };
  });

  const getBuildLogChunk = jest.fn(
    (buildId?: string, opts?: { startLine?: number; lineCount?: number }) => {
      return Promise.resolve({
        lines: [`resolved ${buildId}`],
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

describe('fetch_build_log buildNumber resolution edge cases', () => {
  it('errors when multiple builds match and buildTypeId is missing', async () => {
    const res = await getRequiredTool('fetch_build_log').handler({
      buildNumber: '77',
      page: 1,
      pageSize: 10,
    });
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    // runTool wraps errors in a { success: false, error: { message } } shape
    expect(payload.success).toBe(false);
    const errObj = (payload as { error?: { message?: unknown } }).error;
    const message =
      typeof errObj?.message === 'string' ? errObj.message : String(errObj?.message ?? '');
    expect(message).toContain('Multiple builds match number 77');
  });

  it('falls back to recent list when direct locator returns none', async () => {
    const res = await getRequiredTool('fetch_build_log').handler({
      buildNumber: 56,
      buildTypeId: 'BT_FALLBACK',
      page: 1,
      pageSize: 10,
    });
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.meta.buildId).toBe('2002');
    expect(payload.meta.buildNumber).toBe('56');
    expect(payload.lines[0]).toBe('resolved 2002');
  });
});
