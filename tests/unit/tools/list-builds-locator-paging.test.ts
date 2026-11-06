import { getRequiredTool } from '@/tools';
import { splitLocatorParts } from '@/utils/list-builds-locator';

/**
 * Fake TeamCity build list: five builds, paged by the locator's count/start
 * dimensions. Like a real server, it rejects a locator that repeats a dimension
 * with HTTP 400.
 */
const getAllBuildsMock = jest.fn(async (locator?: string) => {
  const parts = splitLocatorParts(locator ?? '');
  const names = parts.map((part) => part.slice(0, part.indexOf(':')).toLowerCase());
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicate) {
    throw Object.assign(new Error('Request failed with status code 400'), {
      response: { status: 400, data: `Duplicate locator dimension '${duplicate}'` },
    });
  }
  const value = (name: string): number | undefined => {
    const part = parts.find((p) => p.toLowerCase().startsWith(`${name}:`));
    return part ? parseInt(part.slice(name.length + 1), 10) : undefined;
  };
  const start = value('start') ?? 0;
  const count = value('count') ?? 100;
  const all = [1, 2, 3, 4, 5].map((id) => ({ id }));
  const build = all.slice(start, start + count);
  const nextHref = start + count < all.length ? '/next' : undefined;
  return { data: { build, count: build.length, nextHref } };
});

jest.mock('@/api-client', () => ({
  TeamCityAPI: {
    getInstance: () => ({
      builds: { getAllBuilds: getAllBuildsMock },
      modules: { builds: { getAllBuilds: getAllBuildsMock } },
    }),
  },
}));

const listBuilds = async (
  args: Record<string, unknown>
): Promise<{ success: boolean; payload: Record<string, unknown> }> => {
  const res = await getRequiredTool('list_builds').handler(args);
  return {
    success: res.success !== false,
    payload: JSON.parse((res.content?.[0]?.text as string) ?? '{}'),
  };
};

const ids = (payload: Record<string, unknown>): number[] =>
  (payload['items'] as Array<{ id: number }>).map((item) => item.id);

beforeEach(() => {
  getAllBuildsMock.mockClear();
});

describe('list_builds with paging dimensions in the locator', () => {
  it('honours count: in the locator as the page size', async () => {
    const { success, payload } = await listBuilds({
      locator: 'buildType:(id:Example_Build),count:3',
    });

    expect(success).toBe(true);
    expect(ids(payload)).toEqual([1, 2, 3]);
    expect(payload['pagination']).toMatchObject({ page: 1, pageSize: 3 });
  });

  it('honours start: in the locator as the offset', async () => {
    const { success, payload } = await listBuilds({ locator: 'start:2,count:2' });

    expect(success).toBe(true);
    expect(ids(payload)).toEqual([3, 4]);
  });

  it('lets an explicit pageSize win over count: in the locator', async () => {
    const { success, payload } = await listBuilds({ locator: 'count:3', pageSize: 2 });

    expect(success).toBe(true);
    expect(ids(payload)).toEqual([1, 2]);
  });

  it('fetches every page from the locator offset when all=true', async () => {
    const { success, payload } = await listBuilds({ locator: 'count:2,start:1', all: true });

    expect(success).toBe(true);
    expect(ids(payload)).toEqual([2, 3, 4, 5]);
    expect(payload['pagination']).toMatchObject({ mode: 'all', pageSize: 2 });
  });
});
