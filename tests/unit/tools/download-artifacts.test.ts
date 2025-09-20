import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

// Mock config to keep tools in dev mode without reading env
jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'dev',
}));

jest.mock('@/utils/logger/index', () => {
  const debug = jest.fn();
  const info = jest.fn();
  const warn = jest.fn();
  const error = jest.fn();
  const logToolExecution = jest.fn();
  const logTeamCityRequest = jest.fn();
  const logLifecycle = jest.fn();
  const child = jest.fn();

  const mockLoggerInstance = {
    debug,
    info,
    warn,
    error,
    logToolExecution,
    logTeamCityRequest,
    logLifecycle,
    child,
    generateRequestId: () => 'test-request',
  };

  child.mockReturnValue(mockLoggerInstance);

  return {
    getLogger: () => mockLoggerInstance,
    logger: mockLoggerInstance,
    debug,
    info,
    warn,
    error,
  };
});

describe('tools: download_build_artifacts', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('returns base64 content for each artifact', async () => {
    const downloadArtifact = jest
      .fn()
      .mockResolvedValueOnce({
        name: 'first.bin',
        path: 'first.bin',
        size: 6,
        content: Buffer.from('first!').toString('base64'),
        mimeType: 'application/octet-stream',
      })
      .mockResolvedValueOnce({
        name: 'second.txt',
        path: 'second.txt',
        size: 6,
        content: Buffer.from('second').toString('base64'),
        mimeType: 'text/plain',
      });

    const ArtifactManager = jest.fn().mockImplementation(() => ({ downloadArtifact }));
    const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
    const getInstance = jest.fn().mockReturnValue({});

    jest.doMock('@/teamcity/artifact-manager', () => ({
      ArtifactManager,
    }));
    jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
    jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

    let handler:
      | ((args: unknown) => Promise<{ content?: Array<{ text?: string }>; success?: boolean }>)
      | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getRequiredTool } = require('@/tools');
      handler = getRequiredTool('download_build_artifacts').handler;
    });

    if (!handler) {
      throw new Error('download_build_artifacts handler not found');
    }

    const response = await handler({
      buildId: '123',
      artifactPaths: ['first.bin', 'second.txt'],
      encoding: 'base64',
    });

    expect(downloadArtifact).toHaveBeenNthCalledWith(1, '123', 'first.bin', {
      encoding: 'base64',
      maxSize: undefined,
    });
    expect(downloadArtifact).toHaveBeenNthCalledWith(2, '123', 'second.txt', {
      encoding: 'base64',
      maxSize: undefined,
    });

    const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
    expect(Array.isArray(payload.artifacts)).toBe(true);
    expect(payload.artifacts).toHaveLength(2);
    expect(payload.artifacts[0]).toMatchObject({
      name: 'first.bin',
      encoding: 'base64',
      success: true,
    });
    expect(payload.artifacts[0]?.content).toBe(Buffer.from('first!').toString('base64'));
    expect(payload.artifacts[1]).toMatchObject({
      name: 'second.txt',
      encoding: 'base64',
      success: true,
    });
  });

  it('streams artifacts to disk when requested', async () => {
    const firstChunks = ['hello'];
    const secondChunks = ['world'];
    const downloadArtifact = jest
      .fn()
      .mockResolvedValueOnce({
        name: 'logs/app.log',
        path: 'logs/app.log',
        size: 5,
        content: Readable.from(firstChunks),
        mimeType: 'text/plain',
      })
      .mockResolvedValueOnce({
        name: 'metrics.json',
        path: 'metrics.json',
        size: 5,
        content: Readable.from(secondChunks),
        mimeType: 'application/json',
      });

    const ArtifactManager = jest.fn().mockImplementation(() => ({ downloadArtifact }));
    const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
    const getInstance = jest.fn().mockReturnValue({});

    jest.doMock('@/teamcity/artifact-manager', () => ({
      ArtifactManager,
    }));
    jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
    jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

    const tempRoot = await mkdtemp(join(tmpdir(), 'artifact-batch-'));

    let handler:
      | ((args: unknown) => Promise<{ content?: Array<{ text?: string }>; success?: boolean }>)
      | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getRequiredTool } = require('@/tools');
      handler = getRequiredTool('download_build_artifacts').handler;
    });

    if (!handler) {
      throw new Error('download_build_artifacts handler not found');
    }

    const response = await handler({
      buildId: '456',
      artifactPaths: ['logs/app.log', 'metrics.json'],
      encoding: 'stream',
      outputDir: tempRoot,
    });

    expect(downloadArtifact).toHaveBeenNthCalledWith(1, '456', 'logs/app.log', {
      encoding: 'stream',
      maxSize: undefined,
    });
    expect(downloadArtifact).toHaveBeenNthCalledWith(2, '456', 'metrics.json', {
      encoding: 'stream',
      maxSize: undefined,
    });

    const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
    expect(Array.isArray(payload.artifacts)).toBe(true);
    expect(payload.artifacts).toHaveLength(2);
    const [first, second] = payload.artifacts as Array<{
      name?: string;
      outputPath?: string;
      encoding?: string;
      success?: boolean;
    }>;

    expect(first).toBeDefined();
    expect(second).toBeDefined();

    if (!first || !second || !first.outputPath || !second.outputPath) {
      await fs.rm(tempRoot, { recursive: true, force: true });
      throw new Error('Expected stream artifacts with output paths');
    }

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(first.encoding).toBe('stream');
    expect(second.encoding).toBe('stream');
    expect(first.outputPath.startsWith(tempRoot)).toBe(true);
    expect(second.outputPath.startsWith(tempRoot)).toBe(true);

    const firstContent = await fs.readFile(first.outputPath, 'utf8');
    const secondContent = await fs.readFile(second.outputPath, 'utf8');
    expect(firstContent).toBe(firstChunks.join(''));
    expect(secondContent).toBe(secondChunks.join(''));

    await fs.rm(tempRoot, { recursive: true, force: true });
  });
});
