import {
  PaginatedIterator,
  type PaginatedResponse,
  type PaginationParams,
  buildLocator,
  createPaginatedFetcher,
  fetchAllPages,
  parseLocator,
} from '@/teamcity/pagination';

jest.mock('@/utils/logger', () => ({
  info: jest.fn(),
}));

describe('teamcity pagination utilities', () => {
  it('parseLocator/buildLocator round trip', () => {
    const loc = buildLocator({ start: 10, count: 50 });
    expect(loc).toBe('start:10,count:50');
    const parsed = parseLocator(loc);
    expect(parsed).toEqual({ start: 10, count: 50 });
  });

  it('parseLocator handles missing pieces', () => {
    expect(parseLocator('start:5')).toEqual({ start: 5 });
    expect(parseLocator('count:25')).toEqual({ count: 25 });
    expect(parseLocator('start:abc,count:10')).toEqual({ start: NaN, count: 10 });
  });

  it('createPaginatedFetcher passes count/start and extracts fields', async () => {
    const baseFetch = jest.fn(async (params: PaginationParams) => {
      // ensure count/start are forwarded correctly
      expect(params.start).toBe(0);
      expect(params.count).toBe(3);
      return {
        data: {
          nextHref: 'next',
          prevHref: 'prev',
          items: [1, 2, 3],
          total: 3,
        },
      } as unknown as { data: unknown };
    });

    const fetcher = createPaginatedFetcher(
      baseFetch as unknown as (p: PaginationParams) => Promise<unknown>,
      (data: unknown) => (data as { items: number[] }).items,
      (data: unknown) => (data as { total: number }).total
    );

    const resp = await fetcher({ start: 0, count: 3 });
    expect(resp.items).toEqual([1, 2, 3]);
    expect(resp.count).toBe(3);
    expect(resp.total).toBe(3);
    expect(resp.nextHref).toBe('next');
    expect(resp.prevHref).toBe('prev');
  });

  it('fetchAllPages accumulates pages and respects maxPages', async () => {
    const pages: Array<PaginatedResponse<number>> = [
      { items: [1, 2], count: 2, nextHref: 'n1' },
      { items: [3, 4], count: 2, nextHref: 'n2' },
      { items: [5], count: 1 }, // last page (items < pageSize)
    ];
    const fetchFn = async (p: PaginationParams): Promise<PaginatedResponse<number>> => {
      const count = p.count ?? 2;
      const start = p.start ?? 0;
      const index = Math.floor(start / count);
      const i = Math.min(index, pages.length - 1);
      if (i < 0 || i >= pages.length) {
        throw new Error('Invalid page index');
      }
      const page = pages[i];
      if (page === undefined) {
        throw new Error('Page is undefined');
      }
      return page;
    };

    // fetch all with maxPages limit = 2 (should stop at 2 pages)
    const limited = await fetchAllPages(fetchFn, { pageSize: 2, maxPages: 2 });
    expect(limited).toEqual([1, 2, 3, 4]);

    // reset and fetch all pages (stops when items < pageSize)
    const all = await fetchAllPages(fetchFn, { pageSize: 2 });
    expect(all).toEqual([1, 2, 3, 4, 5]);
  });

  it('PaginatedIterator yields items across pages and supports helpers', async () => {
    const pages: Array<PaginatedResponse<number>> = [
      { items: [1, 2], count: 2, nextHref: 'n1' },
      { items: [3, 4], count: 2, nextHref: 'n2' },
      { items: [5], count: 1 },
    ];
    const fetchFn = async (p: PaginationParams): Promise<PaginatedResponse<number>> => {
      const count = p.count ?? 2;
      const start = p.start ?? 0;
      const index = Math.floor(start / count);
      const i = Math.min(index, pages.length - 1);
      if (i < 0 || i >= pages.length) {
        throw new Error('Invalid page index');
      }
      const page = pages[i];
      if (page === undefined) {
        throw new Error('Page is undefined');
      }
      return page;
    };

    const it = new PaginatedIterator(fetchFn, { pageSize: 2 });
    const items = await it.toArray();
    expect(items).toEqual([1, 2, 3, 4, 5]);

    // getPage should return only that page
    const it2 = new PaginatedIterator(fetchFn, { pageSize: 2 });
    const page1 = await it2.getPage(1);
    expect(page1).toEqual([3, 4]);
  });
});
