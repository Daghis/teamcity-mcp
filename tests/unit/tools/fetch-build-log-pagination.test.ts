import { getRequiredTool } from '@/tools';

// Mock TeamCity API client to provide a deterministic log and slicing behavior
jest.mock('@/api-client', () => {
  const fullLogLines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
  const getBuildLogChunk = jest.fn(
    (buildId?: string, opts?: { startLine?: number; lineCount?: number }) => {
      const start = Math.max(0, opts?.startLine ?? 0);
      const count = Math.max(1, opts?.lineCount ?? 500);
      const end = Math.min(fullLogLines.length, start + count);
      const lines = fullLogLines.slice(start, end);
      return Promise.resolve({
        lines,
        startLine: start,
        nextStartLine: end < fullLogLines.length ? end : undefined,
        totalLines: fullLogLines.length,
      });
    }
  );

  return {
    TeamCityAPI: {
      getInstance: () => ({
        getBuildLogChunk,
      }),
    },
  };
});

describe('fetch_build_log pagination', () => {
  it('returns the first page with default pageSize when only page provided', async () => {
    const res = await getRequiredTool('fetch_build_log').handler({
      buildId: '123',
      page: 1,
      pageSize: 3,
    });
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.lines).toEqual(['line 1', 'line 2', 'line 3']);
    expect(payload.meta.page).toBe(1);
    expect(payload.meta.pageSize).toBe(3);
    expect(payload.meta.hasMore).toBe(true);
    expect(payload.meta.nextPage).toBe(2);
  });

  it('returns the second page correctly', async () => {
    const res = await getRequiredTool('fetch_build_log').handler({
      buildId: '123',
      page: 2,
      pageSize: 4,
    });
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.lines).toEqual(['line 5', 'line 6', 'line 7', 'line 8']);
    expect(payload.meta.page).toBe(2);
    expect(payload.meta.pageSize).toBe(4);
    expect(payload.meta.startLine).toBe(4);
    expect(payload.meta.hasMore).toBe(true);
  });

  it('supports explicit startLine and lineCount', async () => {
    const res = await getRequiredTool('fetch_build_log').handler({
      buildId: 'abc',
      startLine: 8,
      lineCount: 5,
    });
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    // Only two lines remain starting at 9th line (0-based index 8)
    expect(payload.lines).toEqual(['line 9', 'line 10']);
    expect(payload.meta.pageSize).toBe(5);
    expect(payload.meta.startLine).toBe(8);
    expect(payload.meta.hasMore).toBe(false);
    expect(payload.meta.totalLines).toBe(10);
  });
});
