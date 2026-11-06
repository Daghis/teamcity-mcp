import { getRequiredTool } from '@/tools';

const mockGetBuildLogTail = jest.fn((_buildId: string, _lineCount: number) =>
  Promise.resolve({ lines: ['line 8', 'line 9', 'line 10'], totalLines: 10 })
);

jest.mock('@/api-client', () => ({
  TeamCityAPI: {
    getInstance: () => ({
      getBuildLogTail: (buildId: string, lineCount: number) =>
        mockGetBuildLogTail(buildId, lineCount),
    }),
  },
}));

describe('fetch_build_log tail mode', () => {
  it('returns the last N lines with correct metadata', async () => {
    const res = await getRequiredTool('fetch_build_log').handler({
      buildId: 'b1',
      tail: true,
      lineCount: 3,
    });
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');

    expect(mockGetBuildLogTail).toHaveBeenCalledWith('b1', 3);
    expect(payload.lines).toEqual(['line 8', 'line 9', 'line 10']);
    expect(payload.meta.mode).toBe('tail');
    expect(payload.meta.pageSize).toBe(3);
    expect(payload.meta.startLine).toBe(7); // 0-based index of 'line 8'
    expect(payload.meta.totalLines).toBe(10);
    expect(payload.meta.hasMore).toBe(true); // There are earlier lines available
  });

  it('reports no earlier lines when the log is shorter than the tail', async () => {
    mockGetBuildLogTail.mockResolvedValueOnce({ lines: ['only'], totalLines: 1 });

    const res = await getRequiredTool('fetch_build_log').handler({
      buildId: 'b2',
      tail: true,
      lineCount: 5,
    });
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');

    expect(payload.lines).toEqual(['only']);
    expect(payload.meta).toMatchObject({ startLine: 0, totalLines: 1, hasMore: false });
  });
});
