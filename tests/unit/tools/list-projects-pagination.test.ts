import { getRequiredTool } from '@/tools';

// Mock TeamCityAPI to simulate paginated project listings
jest.mock('@/api-client', () => {
  const getAllProjects = jest.fn((locator?: string) => {
    const startMatch = locator?.match(/start:(\d+)/);
    const countMatch = locator?.match(/count:(\d+)/);
    const start = startMatch?.[1] ? parseInt(startMatch[1], 10) : 0;
    const count = countMatch?.[1] ? parseInt(countMatch[1], 10) : 100;

    const all = Array.from({ length: 5 }, (_, i) => ({ id: `p${i + 1}` }));
    const slice = all.slice(start, Math.min(start + count, all.length));
    return Promise.resolve({ data: { project: slice, count: all.length } });
  });

  return {
    TeamCityAPI: {
      getInstance: () => ({
        projects: { getAllProjects },
      }),
    },
  };
});

describe('list_projects pagination', () => {
  it('returns first page with pageSize', async () => {
    const res = await getRequiredTool('list_projects').handler({ pageSize: 2 });
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.items).toHaveLength(2);
    expect(payload.pagination.page).toBe(1);
  });

  it('fetches all pages when all=true', async () => {
    const res = await getRequiredTool('list_projects').handler({ pageSize: 2, all: true });
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.items).toHaveLength(5);
    expect(payload.pagination.mode).toBe('all');
  });
});
