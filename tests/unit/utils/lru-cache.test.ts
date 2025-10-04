import { LRUCache } from '@/utils/lru-cache';

describe('LRUCache', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null for missing keys', () => {
    const cache = new LRUCache<string>();
    expect(cache.get('missing')).toBeNull();
    expect(cache.has('missing')).toBe(false);
  });

  it('stores and retrieves values while honoring LRU eviction', () => {
    const cache = new LRUCache<string>({ maxSize: 2 });

    cache.set('a', 'first');
    cache.set('b', 'second');
    expect(cache.get('a')).toBe('first');

    cache.set('c', 'third');
    expect(cache.has('b')).toBe(false);
    expect(cache.has('a')).toBe(true);
    expect(Array.from(cache.keys())).toEqual(['a', 'c']);
  });

  it('expires entries based on ttl when reading', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(0);

    const cache = new LRUCache<string>({ ttl: 100 });
    cache.set('key', 'value');

    nowSpy.mockReturnValue(200);
    expect(cache.get('key')).toBeNull();
    expect(cache.has('key')).toBe(false);
  });

  it('evictExpired removes stale entries without touching valid ones', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    const cache = new LRUCache<string>({ ttl: 50 });

    nowSpy.mockReturnValue(0);
    cache.set('old', 'value');
    nowSpy.mockReturnValue(70);
    cache.set('fresh', 'value');

    nowSpy.mockReturnValue(100);
    cache.evictExpired();

    expect(cache.has('old')).toBe(false);
    expect(cache.has('fresh')).toBe(true);
    expect(cache.size()).toBe(1);
  });
});
