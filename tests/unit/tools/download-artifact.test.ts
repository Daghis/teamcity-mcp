import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

// Mock config to keep tools in dev mode without reading env
jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'dev',
}));

jest.mock('@/utils/logger/index', () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    generateRequestId: () => 'test-request',
    logToolExecution: jest.fn(),
  }),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('tools: download_build_artifact', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('returns base64 content when requested encoding is base64', async () => {
    const downloadArtifact = jest.fn().mockResolvedValue({
      name: 'artifact.bin',
      path: 'artifact.bin',
      size: 12,
      content: Buffer.from('hello world!').toString('base64'),
      mimeType: 'application/octet-stream',
    });

    const ArtifactManager = jest.fn().mockImplementation(() => ({ downloadArtifact }));
    const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
    const getInstance = jest.fn().mockReturnValue({});

    jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
    jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
    jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

    let handler:
      | ((args: unknown) => Promise<{ content?: Array<{ text?: string }>; success?: boolean }>)
      | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getRequiredTool } = require('@/tools');
      handler = getRequiredTool('download_build_artifact').handler;
    });

    if (!handler) {
      throw new Error('download_build_artifact handler not found');
    }

    const response = await handler({
      buildId: '123',
      artifactPath: 'artifact.bin',
      encoding: 'base64',
    });

    const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
    expect(payload.encoding).toBe('base64');
    expect(payload.content).toBe(Buffer.from('hello world!').toString('base64'));
    expect(downloadArtifact).toHaveBeenCalledWith('123', 'artifact.bin', {
      encoding: 'base64',
      maxSize: undefined,
    });
  });

  it('streams artifact content to the requested output path', async () => {
    const chunks = ['hello', ' ', 'mcp'];
    const stream = Readable.from(chunks);
    const downloadArtifact = jest.fn().mockResolvedValue({
      name: 'logs/build.log',
      path: 'logs/build.log',
      size: 11,
      content: stream,
      mimeType: 'text/plain',
    });

    const ArtifactManager = jest.fn().mockImplementation(() => ({ downloadArtifact }));
    const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
    const getInstance = jest.fn().mockReturnValue({});

    jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
    jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
    jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

    const targetPath = join(tmpdir(), `artifact-stream-${Date.now()}.log`);

    let handler:
      | ((args: unknown) => Promise<{ content?: Array<{ text?: string }>; success?: boolean }>)
      | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getRequiredTool } = require('@/tools');
      handler = getRequiredTool('download_build_artifact').handler;
    });

    if (!handler) {
      throw new Error('download_build_artifact handler not found');
    }

    const response = await handler({
      buildId: '456',
      artifactPath: 'logs/build.log',
      encoding: 'stream',
      outputPath: targetPath,
    });

    const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
    expect(payload.encoding).toBe('stream');
    expect(payload.outputPath).toBe(targetPath);
    expect(downloadArtifact).toHaveBeenCalledWith('456', 'logs/build.log', {
      encoding: 'stream',
      maxSize: undefined,
    });

    const written = await fs.readFile(targetPath, 'utf8');
    expect(written).toBe(chunks.join(''));

    await fs.rm(targetPath, { force: true });
  });
});
