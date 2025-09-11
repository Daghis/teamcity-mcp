/**
 * Cache manager for TeamCity Swagger specifications
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import { debug, info, error as logError, warn } from '@/utils/logger';

import type { SwaggerSpec } from './swagger-fetcher';

export interface SwaggerCacheConfig {
  cacheDir?: string;
  ttl?: number; // Time to live in milliseconds
}

interface CachedSpec {
  spec: SwaggerSpec;
  timestamp: number;
  hash?: string;
}

export class SwaggerCache {
  private cacheDir: string;
  private ttl: number;

  constructor(config: SwaggerCacheConfig = {}) {
    this.cacheDir = config.cacheDir ?? path.join(process.cwd(), '.cache');
    this.ttl = config.ttl ?? 24 * 60 * 60 * 1000; // Default 24 hours

    info('SwaggerCache initialized', {
      cacheDir: this.cacheDir,
      ttl: `${this.ttl / 1000 / 60 / 60} hours`,
    });
  }

  /**
   * Get cached spec if available and not expired
   */
  async get(key: string): Promise<SwaggerSpec | null> {
    const filePath = this.getCacheFilePath(key);

    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const cached = JSON.parse(data) as CachedSpec;

      // Check if cache is expired
      const age = Date.now() - cached.timestamp;
      if (age > this.ttl) {
        info('Cache expired', {
          key,
          age: `${Math.round(age / 1000 / 60)} minutes`,
          ttl: `${this.ttl / 1000 / 60} minutes`,
        });
        return null;
      }

      info('Cache hit', {
        key,
        age: `${Math.round(age / 1000 / 60)} minutes`,
      });

      return cached.spec;
    } catch (err) {
      if (err instanceof Error && err.message.includes('ENOENT')) {
        debug('Cache miss - file not found', { key });
      } else {
        warn('Failed to read cache', { error: err });
      }
      return null;
    }
  }

  /**
   * Save spec to cache
   */
  async set(key: string, spec: SwaggerSpec): Promise<void> {
    const filePath = this.getCacheFilePath(key);

    try {
      // Ensure cache directory exists
      await fs.mkdir(this.cacheDir, { recursive: true });

      // Create cached data with timestamp and hash
      const cached: CachedSpec = {
        spec,
        timestamp: Date.now(),
        hash: this.generateHash(spec),
      };

      // Write to cache file
      await fs.writeFile(filePath, JSON.stringify(cached, null, 2), 'utf-8');

      info('Spec cached successfully', {
        key,
        size: `${Math.round(JSON.stringify(cached).length / 1024)} KB`,
      });
    } catch (err) {
      logError('Failed to cache spec', err instanceof Error ? err : new Error(String(err)));
      throw new Error(
        `Failed to cache spec: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Clear cached spec
   */
  async clear(key?: string): Promise<void> {
    try {
      if (key !== undefined && key !== '') {
        // Clear specific cache file
        const filePath = this.getCacheFilePath(key);
        await fs.unlink(filePath);
        info('Cache cleared', { key });
      } else {
        // Clear all cache files
        const files = await fs.readdir(this.cacheDir);
        const jsonFiles = files.filter((f) => f.endsWith('.json'));

        // Intentional sequential cleanup of small file list; IO is trivial and keeps logic simple
        /* eslint-disable no-await-in-loop */
        for (const file of jsonFiles) {
          await fs.unlink(path.join(this.cacheDir, file));
        }
        /* eslint-enable no-await-in-loop */

        info('All cache cleared', { count: jsonFiles.length });
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('ENOENT')) {
        debug('Cache file not found');
      } else {
        warn('Failed to clear cache', { error: err });
      }
    }
  }

  /**
   * Check if cache exists and is valid
   */
  async isValid(key: string): Promise<boolean> {
    const spec = await this.get(key);
    return spec !== null;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    size: number;
    files: number;
    oldestFile?: Date;
    newestFile?: Date;
  }> {
    try {
      const files = await fs.readdir(this.cacheDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      let totalSize = 0;
      let oldest: Date | undefined;
      let newest: Date | undefined;

      // Sequential stat calls; number of files is small and simplifies mtime tracking
      /* eslint-disable no-await-in-loop */
      for (const file of jsonFiles) {
        const filePath = path.join(this.cacheDir, file);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;

        if (!oldest || stats.mtime < oldest) {
          oldest = stats.mtime;
        }
        if (!newest || stats.mtime > newest) {
          newest = stats.mtime;
        }
      }
      /* eslint-enable no-await-in-loop */

      const result: {
        size: number;
        files: number;
        oldestFile?: Date;
        newestFile?: Date;
      } = {
        size: totalSize,
        files: jsonFiles.length,
      };

      if (oldest !== undefined) {
        result.oldestFile = oldest;
      }
      if (newest !== undefined) {
        result.newestFile = newest;
      }

      return result;
    } catch (err) {
      warn('Failed to get cache stats', { error: err });
      return { size: 0, files: 0 };
    }
  }

  /**
   * Get cache file path for a key
   */
  private getCacheFilePath(key: string): string {
    // Sanitize key for filesystem
    const safeKey = key.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(this.cacheDir, `${safeKey}.json`);
  }

  /**
   * Generate hash for spec content
   */
  private generateHash(spec: SwaggerSpec): string {
    const content = JSON.stringify(spec);
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
  }
}
