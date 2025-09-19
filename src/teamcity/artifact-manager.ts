/**
 * ArtifactManager - Advanced artifact management for TeamCity builds
 */
import type { TeamCityClientAdapter } from './client-adapter';

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
  encoding?: 'base64' | 'text' | 'buffer';
  maxSize?: number;
}

export interface ArtifactContent {
  name: string;
  path: string;
  size: number;
  content?: string | Buffer;
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

  constructor(client: TeamCityClientAdapter) {
    this.client = client;
  }

  private request<T>(
    fn: (ctx: {
      axios: ReturnType<TeamCityClientAdapter['getAxios']>;
      baseUrl: string;
    }) => Promise<T>
  ): Promise<T> {
    return this.client.request(fn);
  }

  private buildRestUrl(baseUrl: string, path: string): string {
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    if (path.startsWith('/')) {
      return `${normalizedBase}${path}`;
    }
    return `${normalizedBase}/${path}`;
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
      // Fetch artifacts from API
      const response = await this.request((ctx) =>
        ctx.axios.get(this.buildRestUrl(ctx.baseUrl, `/app/rest/builds/id:${buildId}/artifacts`), {
          headers: { Accept: 'application/json' },
        })
      );

      const baseUrl = this.getBaseUrl();
      let artifacts = this.parseArtifacts(
        response.data as ArtifactFileResponse,
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
    // First, get artifact info to check size
    const artifacts = await this.listArtifacts(buildId);
    const artifact = artifacts.find((a) => a.path === artifactPath || a.name === artifactPath);

    if (!artifact) {
      throw new Error(`Artifact not found: ${artifactPath}`);
    }

    // Check size limit
    if (options.maxSize && artifact.size > options.maxSize) {
      throw new Error(
        `Artifact size exceeds maximum allowed size: ${artifact.size} > ${options.maxSize}`
      );
    }

    try {
      const responseType = options.encoding === 'text' ? 'text' : 'arraybuffer';
      const normalizedPath = artifact.path
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');

      if (responseType === 'text') {
        const response = await this.request((ctx) =>
          ctx.axios.get<string>(
            this.buildRestUrl(
              ctx.baseUrl,
              `/app/rest/builds/id:${buildId}/artifacts/content/${normalizedPath}`
            ),
            {
              responseType,
            }
          )
        );

        return {
          name: artifact.name,
          path: artifact.path,
          size: artifact.size,
          content: response.data,
          mimeType: response.headers['content-type'],
        };
      }

      const response = await this.request((ctx) =>
        ctx.axios.get<ArrayBuffer>(
          this.buildRestUrl(
            ctx.baseUrl,
            `/app/rest/builds/id:${buildId}/artifacts/content/${normalizedPath}`
          ),
          {
            responseType,
          }
        )
      );

      const arrayBuffer = response.data;
      const buffer = Buffer.from(arrayBuffer);

      let content: string | Buffer;
      if (options.encoding === 'base64') {
        content = buffer.toString('base64');
      } else {
        content = buffer;
      }

      return {
        name: artifact.name,
        path: artifact.path,
        size: artifact.size,
        content,
        mimeType: response.headers['content-type'],
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
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
    // Default to base64 encoding if not specified
    const downloadOptions = { encoding: 'base64' as const, ...options };

    const results = await Promise.allSettled(
      artifactPaths.map((path) => this.downloadArtifact(buildId, path, downloadOptions))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // Return partial result with error
        const fallbackName = artifactPaths[index] ?? 'unknown';
        return {
          name: fallbackName,
          path: fallbackName,
          size: 0,
          error: result.reason.message,
        };
      }
    });
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
}
