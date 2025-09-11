import { getRequiredTool } from '@/tools';

jest.mock('@/api-client', () => {
  const getAllBuilds = jest.fn((locator?: string) => {
    // Parse start/count from locator
    const startMatch = locator?.match(/start:(\d+)/);
    const countMatch = locator?.match(/count:(\d+)/);
    const start = startMatch?.[1] ? parseInt(startMatch[1], 10) : 0;
    const count = countMatch?.[1] ? parseInt(countMatch[1], 10) : 100;

    const items = [] as Array<{ id: number }>;
    for (let i = start; i < start + count && i < 3; i++) {
      items.push({ id: i + 1 });
    }

    const nextHref = start + count < 3 ? '/next' : undefined;
    return Promise.resolve({ data: { build: items, count: 3, nextHref } });
  });

  return {
    TeamCityAPI: {
      getInstance: () => ({
        builds: {
          getAllBuilds,
        },
      }),
    },
  };
});

describe('list_builds pagination', () => {
  it('returns first page when all is not set', async () => {
    const res = await getRequiredTool('list_builds').handler({ pageSize: 2 });
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.items).toHaveLength(2);
    expect(payload.pagination.page).toBe(1);
  });

  it('fetches all pages when all=true', async () => {
    const res = await getRequiredTool('list_builds').handler({ pageSize: 2, all: true });
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.items).toHaveLength(3);
    expect(payload.pagination.mode).toBe('all');
  });
});
