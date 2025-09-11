/**
 * Pagination utilities for TeamCity API
 */
import { info } from '@/utils/logger';

export interface PaginationParams {
  count?: number;
  start?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  count: number;
  total?: number;
  nextHref?: string;
  prevHref?: string;
}

export interface PaginationOptions {
  pageSize?: number;
  maxPages?: number;
  fetchAll?: boolean;
}

interface ApiResponse<T = unknown> {
  data: T & {
    nextHref?: string;
    prevHref?: string;
  };
}

/**
 * Async iterator for paginated results
 */
export class PaginatedIterator<T> {
  private currentPage = 0;
  private hasMore = true;
  private readonly pageSize: number;
  private readonly maxPages?: number;
  private readonly fetchFn: (params: PaginationParams) => Promise<PaginatedResponse<T>>;

  constructor(
    fetchFn: (params: PaginationParams) => Promise<PaginatedResponse<T>>,
    options: PaginationOptions = {}
  ) {
    this.fetchFn = fetchFn;
    this.pageSize = options.pageSize ?? 100;
    this.maxPages = options.maxPages;
  }

  /**
   * Async iterator implementation
   */
  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (this.hasMore && (!this.maxPages || this.currentPage < this.maxPages)) {
      const start = this.currentPage * this.pageSize;
      // Sequential page fetch; preserves order and avoids overfetching
      // eslint-disable-next-line no-await-in-loop
      const response = await this.fetchFn({
        count: this.pageSize,
        start,
      });

      for (const item of response.items) {
        yield item;
      }

      this.currentPage++;
      this.hasMore = response.nextHref !== undefined || response.items.length === this.pageSize;

      if (response.items.length < this.pageSize) {
        this.hasMore = false;
      }
    }
  }

  /**
   * Collect all items into array
   */
  async toArray(): Promise<T[]> {
    const items: T[] = [];
    for await (const item of this) {
      items.push(item);
    }
    return items;
  }

  /**
   * Get a single page
   */
  async getPage(pageNumber: number): Promise<T[]> {
    const start = pageNumber * this.pageSize;
    const response = await this.fetchFn({
      count: this.pageSize,
      start,
    });
    return response.items;
  }
}

/**
 * Create paginated fetcher function
 */
export function createPaginatedFetcher<T>(
  baseFetch: (params: PaginationParams) => Promise<unknown>,
  extractItems: (response: unknown) => T[],
  extractTotal?: (response: unknown) => number | undefined
): (params: PaginationParams) => Promise<PaginatedResponse<T>> {
  return async (params: PaginationParams) => {
    const response = (await baseFetch({
      count: params.count,
      start: params.start,
    })) as ApiResponse;

    const items = extractItems(response.data);
    const total = extractTotal?.(response.data);

    return {
      items,
      count: items.length,
      total,
      nextHref: response.data?.nextHref,
      prevHref: response.data?.prevHref,
    };
  };
}

/**
 * Fetch all pages automatically
 */
export async function fetchAllPages<T>(
  fetchFn: (params: PaginationParams) => Promise<PaginatedResponse<T>>,
  options: PaginationOptions = {}
): Promise<T[]> {
  const allItems: T[] = [];
  let hasMore = true;
  let currentPage = 0;
  const pageSize = options.pageSize ?? 100;
  const maxPages = options.maxPages;

  info('Starting paginated fetch', { pageSize, maxPages });

  while (hasMore && (!maxPages || currentPage < maxPages)) {
    const start = currentPage * pageSize;
    // Sequential page fetch; keeps memory and requests bounded
    // eslint-disable-next-line no-await-in-loop
    const response = await fetchFn({
      count: pageSize,
      start,
    });

    allItems.push(...response.items);
    currentPage++;

    hasMore = response.nextHref !== undefined || response.items.length === pageSize;

    if (response.items.length < pageSize) {
      hasMore = false;
    }

    info(`Fetched page ${currentPage}`, {
      itemsInPage: response.items.length,
      totalItems: allItems.length,
      hasMore,
    });
  }

  info('Paginated fetch complete', {
    totalPages: currentPage,
    totalItems: allItems.length,
  });

  return allItems;
}

/**
 * Parse TeamCity locator string for pagination
 */
export function parseLocator(locator: string): PaginationParams {
  const params: PaginationParams = {};

  const parts = locator.split(',');
  for (const part of parts) {
    const [key, value] = part.split(':');
    if (key === 'start' && value !== undefined) {
      params.start = parseInt(value, 10);
    } else if (key === 'count' && value !== undefined) {
      params.count = parseInt(value, 10);
    }
  }

  return params;
}

/**
 * Build TeamCity locator string for pagination
 */
export function buildLocator(params: PaginationParams): string {
  const parts: string[] = [];

  if (params.start !== undefined) {
    parts.push(`start:${params.start}`);
  }
  if (params.count !== undefined) {
    parts.push(`count:${params.count}`);
  }

  return parts.join(',');
}
