import { getRequiredTool } from '@/tools';

// Mock TeamCity API client to provide a deterministic full log
jest.mock('@/api-client', () => {
  const fullLogLines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
  const getBuildLog = jest.fn(() => Promise.resolve(fullLogLines.join('\n')));

  return {
    TeamCityAPI: {
      getInstance: () => ({
        getBuildLog,
      }),
    },
  };
});

describe('fetch_build_log tail mode', () => {
  it('returns the last N lines with correct metadata', async () => {
    const res = await getRequiredTool('fetch_build_log').handler({
      buildId: 'b1',
      tail: true,
      lineCount: 3,
    });
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');

    expect(payload.lines).toEqual(['line 8', 'line 9', 'line 10']);
    expect(payload.meta.mode).toBe('tail');
    expect(payload.meta.pageSize).toBe(3);
    expect(payload.meta.startLine).toBe(7); // 0-based index of 'line 8'
    expect(payload.meta.totalLines).toBe(10);
    expect(payload.meta.hasMore).toBe(true); // There are earlier lines available
  });
});
