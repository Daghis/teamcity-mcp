import { LRUCache } from '@/utils/lru-cache';

describe('LRUCache', () => {
  const realNow = Date.now;

  afterEach(() => {
    // Restore Date.now after time-based tests
    // eslint-disable-next-line @typescript-eslint/unbound-method
    Date.now = realNow;
  });

  it('gets and sets values; has/delete/clear/size/keys work', () => {
    const cache = new LRUCache<string>({ maxSize: 3, ttl: 60_000 });
    expect(cache.size()).toBe(0);
    expect(cache.get('a')).toBeNull();
    expect(cache.has('a')).toBe(false);

    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    expect(cache.size()).toBe(3);
    expect(cache.has('a')).toBe(true);
    expect(cache.get('a')).toBe('1');

    // keys() iteration
    const keys = Array.from(cache.keys());
    expect(keys.length).toBe(3);

    // delete
    expect(cache.delete('b')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.size()).toBe(2);

    // clear
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('evicts least recently used when exceeding maxSize', () => {
    const cache = new LRUCache<string>({ maxSize: 2, ttl: 60_000 });
    cache.set('a', '1');
    cache.set('b', '2');
    // Access 'a' to make it most recently used
    expect(cache.get('a')).toBe('1');
    // Add 'c' -> should evict least recently used (which is 'b')
    cache.set('c', '3');
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
  });

  it('expires entries by ttl via get/has and evictExpired()', () => {
    const start = 1_000_000_000_000; // arbitrary epoch
    // eslint-disable-next-line @typescript-eslint/unbound-method
    Date.now = jest.fn(() => start);

    const cache = new LRUCache<string>({ maxSize: 5, ttl: 10_000 });
    cache.set('x', 'val');

    // Advance time within TTL
    (Date.now as unknown as jest.Mock).mockReturnValue(start + 9_000);
    expect(cache.has('x')).toBe(true);
    expect(cache.get('x')).toBe('val');

    // Advance beyond TTL
    (Date.now as unknown as jest.Mock).mockReturnValue(start + 11_000);
    expect(cache.has('x')).toBe(false);
    expect(cache.get('x')).toBeNull();

    // Re-add and then evictExpired
    (Date.now as unknown as jest.Mock).mockReturnValue(start + 12_000);
    cache.set('y', 'val2');
    (Date.now as unknown as jest.Mock).mockReturnValue(start + 23_000);
    cache.evictExpired();
    expect(cache.has('y')).toBe(false);
  });
});
