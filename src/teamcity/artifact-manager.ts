/**
 * ArtifactManager - Advanced artifact management for TeamCity builds
 */
import type { Readable } from 'node:stream';

import { type AxiosResponse, isAxiosError } from 'axios';

import { debug as logDebug } from '@/utils/logger';

import type { TeamCityClientAdapter } from './client-adapter';
import { toBuildLocator } from './utils/build-locator';

export interface ArtifactInfo {
  name: string;
  path: string;
  size: number;
  modificationTime?: string;
  downloadUrl: string;
  isDirectory?: boolean;
}

export interface ArtifactListOptions {
  nameFilter?: string;
  pathFilter?: string;
  extension?: string;
  minSize?: number;
  maxSize?: number;
  includeNested?: boolean;
  limit?: number;
  offset?: number;
  forceRefresh?: boolean;
}

export interface ArtifactDownloadOptions {
  encoding?: 'base64' | 'text' | 'buffer' | 'stream';
  maxSize?: number;
}

export interface ArtifactContent {
  name: string;
  path: string;
  size: number;
  content?: string | Buffer | Readable;
  mimeType?: string;
  error?: string;
}

interface CacheEntry {
  artifacts: ArtifactInfo[];
  timestamp: number;
}

interface ArtifactFile {
  name?: string;
  fullName?: string;
  size?: number;
  href?: string;
  modificationTime?: string;
  children?: ArtifactFileResponse;
}

interface ArtifactFileResponse {
  file?: ArtifactFile[];
}

export class ArtifactManager {
  private readonly client: TeamCityClientAdapter;
  private cache: Map<string, CacheEntry> = new Map();
  private static readonly cacheTtlMs = 60000; // 1 minute
  private static readonly defaultLimit = 100;
  private static readonly maxLimit = 1000;
  private static readonly artifactRetryAttempts = 10;
  private static readonly artifactRetryDelayMs = 1000;

  constructor(client: TeamCityClientAdapter) {
    this.client = client;
  }

  private getBaseUrl(): string {
    const baseUrl = this.client.getApiConfig().baseUrl;
    return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }

  /**
   * List artifacts for a build
   */
  async listArtifacts(buildId: string, options: ArtifactListOptions = {}): Promise<ArtifactInfo[]> {
    // Check cache unless force refresh
    const cacheKey = this.getCacheKey(buildId, options);
    if (!options.forceRefresh) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      const buildLocator = toBuildLocator(buildId);
      // Fetch artifacts from API
      const response = await this.client.modules.builds.getFilesListOfBuild(
        buildLocator,
        undefined,
        undefined,
        'file(name,fullName,size,modificationTime,href,children(file(name,fullName,size,modificationTime,href)))'
      );

      const baseUrl = this.getBaseUrl();
      let artifacts = this.parseArtifacts(
        (response.data as ArtifactFileResponse) ?? {},
        buildId,
        options.includeNested,
        baseUrl
      );

      // Apply filters
      artifacts = this.applyFilters(artifacts, options);

      // Apply pagination
      if (options.limit ?? options.offset) {
        artifacts = this.paginate(
          artifacts,
          options.offset ?? 0,
          options.limit ?? ArtifactManager.defaultLimit
        );
      }

      // Cache the result
      this.cacheResult(cacheKey, artifacts);

      return artifacts;
    } catch (error) {
      const err = error as { response?: { status?: number }; message?: string };
      if (err.response?.status === 401) {
        throw new Error('Authentication failed: Invalid TeamCity token');
      }
      if (err.response?.status === 404) {
        throw new Error(`Build not found: ${buildId}`);
      }
      const errMsg = err.message ?? String(error);
      throw new Error(`Failed to fetch artifacts: ${errMsg}`);
    }
  }

  /**
   * Download a specific artifact
   */
  async downloadArtifact(
    buildId: string,
    artifactPath: string,
    options: ArtifactDownloadOptions = {}
  ): Promise<ArtifactContent> {
    let artifact: ArtifactInfo | undefined;
    for (let attempt = 1; attempt <= ArtifactManager.artifactRetryAttempts; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const artifacts = await this.listArtifacts(buildId, { forceRefresh: attempt > 1 });
      const listSample = artifacts.slice(0, 5).map((entry) => entry.path);
      logDebug('artifact-manager.downloadArtifact.list', {
        buildId,
        requested: artifactPath,
        availableCount: artifacts.length,
        sample: listSample,
        includeNested: false,
        attempt,
      });
      artifact = artifacts.find((a) => a.path === artifactPath || a.name === artifactPath);

      if (!artifact) {
        // eslint-disable-next-line no-await-in-loop
        const nestedArtifacts = await this.listArtifacts(buildId, {
          includeNested: true,
          forceRefresh: true,
        });
        const nestedSample = nestedArtifacts.slice(0, 5).map((entry) => entry.path);
        logDebug('artifact-manager.downloadArtifact.listNested', {
          buildId,
          requested: artifactPath,
          availableCount: nestedArtifacts.length,
          sample: nestedSample,
          attempt,
        });
        artifact = nestedArtifacts.find((a) => a.path === artifactPath || a.name === artifactPath);
      }

      if (artifact) {
        break;
      }

      if (attempt < ArtifactManager.artifactRetryAttempts) {
        // eslint-disable-next-line no-await-in-loop
        await this.delay(ArtifactManager.artifactRetryDelayMs);
      }
    }

    if (!artifact) {
      logDebug('artifact-manager.downloadArtifact.miss', {
        buildId,
        requested: artifactPath,
        attempts: ArtifactManager.artifactRetryAttempts,
      });
      throw new Error(`Artifact not found: ${artifactPath}`);
    }

    // Check size limit
    if (options.maxSize && artifact.size > options.maxSize) {
      throw new Error(
        `Artifact size exceeds maximum allowed size: ${artifact.size} > ${options.maxSize}`
      );
    }

    try {
      const encoding = options.encoding ?? 'buffer';

      if (encoding === 'text') {
        const response = await this.client.downloadArtifactContent<string>(buildId, artifact.path, {
          responseType: 'text',
        });

        const axiosResponse = response as AxiosResponse<unknown>;
        const { data, headers } = axiosResponse;

        if (typeof data !== 'string') {
          throw new Error('Artifact download returned a non-text payload when text was expected');
        }

        const mimeType =
          typeof headers?.['content-type'] === 'string' ? headers['content-type'] : undefined;

        return {
          name: artifact.name,
          path: artifact.path,
          size: artifact.size,
          content: data,
          mimeType,
        };
      }

      if (encoding === 'stream') {
        const response = await this.client.downloadArtifactContent<Readable>(
          buildId,
          artifact.path,
          {
            responseType: 'stream',
          }
        );

        const axiosResponse = response as AxiosResponse<unknown>;
        const stream = axiosResponse.data;

        if (!this.isReadableStream(stream)) {
          throw new Error(
            'Artifact download returned a non-stream payload when stream was requested'
          );
        }

        const mimeType =
          typeof axiosResponse.headers?.['content-type'] === 'string'
            ? axiosResponse.headers['content-type']
            : undefined;

        return {
          name: artifact.name,
          path: artifact.path,
          size: artifact.size,
          content: stream,
          mimeType,
        };
      }

      const response = await this.client.downloadArtifactContent<ArrayBuffer>(
        buildId,
        artifact.path,
        {
          responseType: 'arraybuffer',
        }
      );

      const axiosResponse = response as AxiosResponse<unknown>;
      const buffer = this.ensureBinaryBuffer(axiosResponse.data);

      let content: string | Buffer;
      if (encoding === 'base64') {
        content = buffer.toString('base64');
      } else {
        content = buffer;
      }

      return {
        name: artifact.name,
        path: artifact.path,
        size: artifact.size,
        content,
        mimeType:
          typeof axiosResponse.headers?.['content-type'] === 'string'
            ? axiosResponse.headers['content-type']
            : undefined,
      };
    } catch (error) {
      let errMsg: string;
      if (isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data;
        let detail: string | undefined;
        if (typeof data === 'string') {
          detail = data;
        } else if (data !== undefined && data !== null && typeof data === 'object') {
          try {
            detail = JSON.stringify(data);
          } catch {
            detail = '[unserializable response body]';
          }
        }
        errMsg = `HTTP ${status ?? 'unknown'}${detail ? `: ${detail}` : ''}`;
      } else {
        errMsg = error instanceof Error ? error.message : 'Unknown error';
      }
      throw new Error(`Failed to download artifact: ${errMsg}`);
    }
  }

  /**
   * Download multiple artifacts
   */
  async downloadMultipleArtifacts(
    buildId: string,
    artifactPaths: string[],
    options: ArtifactDownloadOptions = {}
  ): Promise<ArtifactContent[]> {
    const downloadOptions = {
      encoding: (options.encoding ?? 'base64') as ArtifactDownloadOptions['encoding'],
      maxSize: options.maxSize,
    };
    const results: ArtifactContent[] = [];

    for (const path of artifactPaths) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const artifact = await this.downloadArtifact(buildId, path, downloadOptions);
        results.push(artifact);
      } catch (error) {
        const reason = error as { message?: string } | Error | string;
        const message =
          reason instanceof Error
            ? reason.message
            : typeof reason === 'object' && reason?.message
              ? String(reason.message)
              : String(reason ?? 'Unknown error');
        const fallbackName = path ?? 'unknown';
        logDebug('artifact-manager.downloadMultipleArtifacts.error', {
          buildId,
          requested: fallbackName,
          encoding: downloadOptions.encoding,
          error: message,
        });
        results.push({
          name: fallbackName,
          path: fallbackName,
          size: 0,
          error: message,
        });
      }
    }

    return results;
  }

  /**
   * Parse artifacts from API response
   */
  private parseArtifacts(
    data: ArtifactFileResponse,
    buildId: string,
    includeNested: boolean | undefined,
    baseUrl: string
  ): ArtifactInfo[] {
    const artifacts: ArtifactInfo[] = [];
    const files = data.file ?? [];

    for (const file of files) {
      // If it's a directory and has children
      if (file.children && includeNested) {
        // Recursively parse nested artifacts
        const nested = this.parseArtifacts(file.children, buildId, includeNested, baseUrl);
        artifacts.push(...nested);
      } else if (!file.children) {
        // It's a file, not a directory
        artifacts.push({
          name: file.name ?? '',
          path: file.fullName ?? file.name ?? '',
          size: file.size ?? 0,
          modificationTime: file.modificationTime ?? '',
          downloadUrl: `${baseUrl}/app/rest/builds/id:${buildId}/artifacts/content/${file.fullName ?? file.name ?? ''}`,
          isDirectory: false,
        });
      }
    }

    return artifacts;
  }

  private ensureBinaryBuffer(payload: unknown): Buffer {
    if (Buffer.isBuffer(payload)) {
      return payload;
    }

    if (payload instanceof ArrayBuffer) {
      return Buffer.from(payload);
    }

    throw new Error('Artifact download returned unexpected binary payload type');
  }

  private isReadableStream(value: unknown): value is Readable {
    if (value == null || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Readable;
    return typeof candidate.pipe === 'function';
  }

  /**
   * Apply filters to artifacts
   */
  private applyFilters(artifacts: ArtifactInfo[], options: ArtifactListOptions): ArtifactInfo[] {
    let filtered = artifacts;

    // Filter by name pattern
    if (options.nameFilter) {
      const regex = this.globToRegex(options.nameFilter);
      filtered = filtered.filter((a) => regex.test(a.name));
    }

    // Filter by path pattern
    if (options.pathFilter) {
      const regex = this.globToRegex(options.pathFilter);
      filtered = filtered.filter((a) => regex.test(a.path));
    }

    // Filter by extension
    if (options.extension) {
      const ext = options.extension.startsWith('.') ? options.extension : `.${options.extension}`;
      filtered = filtered.filter((a) => a.name.endsWith(ext));
    }

    // Filter by size range
    if (options.minSize !== undefined) {
      const minSize = options.minSize as number;
      filtered = filtered.filter((a) => a.size >= minSize);
    }
    if (options.maxSize !== undefined) {
      const maxSize = options.maxSize as number;
      filtered = filtered.filter((a) => a.size <= maxSize);
    }

    return filtered;
  }

  /**
   * Convert glob pattern to regex
   */
  private globToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
  }

  /**
   * Paginate results
   */
  private paginate(artifacts: ArtifactInfo[], offset: number, limit: number): ArtifactInfo[] {
    const effectiveLimit = Math.min(limit, ArtifactManager.maxLimit);
    return artifacts.slice(offset, offset + effectiveLimit);
  }

  /**
   * Generate cache key
   */
  private getCacheKey(buildId: string, options: ArtifactListOptions): string {
    const { forceRefresh: _forceRefresh, ...cacheOptions } = options;
    return `${buildId}:${JSON.stringify(cacheOptions)}`;
  }

  /**
   * Get from cache if valid
   */
  private getFromCache(key: string): ArtifactInfo[] | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const age = Date.now() - entry.timestamp;
    if (age > ArtifactManager.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.artifacts;
  }

  /**
   * Cache artifacts
   */
  private cacheResult(key: string, artifacts: ArtifactInfo[]): void {
    this.cache.set(key, {
      artifacts,
      timestamp: Date.now(),
    });

    // Clean old entries
    this.cleanCache();
  }

  /**
   * Remove expired cache entries
   */
  private cleanCache(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > ArtifactManager.cacheTtlMs) {
        expired.push(key);
      }
    }

    for (const key of expired) {
      this.cache.delete(key);
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
