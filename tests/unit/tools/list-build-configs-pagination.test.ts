import { getRequiredTool } from '@/tools';

// Mock TeamCityAPI to simulate paginated build type listings
jest.mock('@/api-client', () => {
  const getAllBuildTypes = jest.fn((locator?: string) => {
    const startMatch = locator?.match(/start:(\d+)/);
    const countMatch = locator?.match(/count:(\d+)/);
    const start = startMatch?.[1] ? parseInt(startMatch[1], 10) : 0;
    const count = countMatch?.[1] ? parseInt(countMatch[1], 10) : 100;

    const all = Array.from({ length: 4 }, (_, i) => ({ id: `bt${i + 1}` }));
    const slice = all.slice(start, Math.min(start + count, all.length));
    return Promise.resolve({ data: { buildType: slice, count: all.length } });
  });

  return {
    TeamCityAPI: {
      getInstance: () => ({
        buildTypes: { getAllBuildTypes },
      }),
    },
  };
});

describe('list_build_configs pagination', () => {
  it('returns first page with pageSize', async () => {
    const res = await getRequiredTool('list_build_configs').handler({ pageSize: 2 });
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.items).toHaveLength(2);
    expect(payload.pagination.page).toBe(1);
  });

  it('fetches all pages when all=true', async () => {
    const res = await getRequiredTool('list_build_configs').handler({ pageSize: 2, all: true });
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.items).toHaveLength(4);
    expect(payload.pagination.mode).toBe('all');
  });
});
