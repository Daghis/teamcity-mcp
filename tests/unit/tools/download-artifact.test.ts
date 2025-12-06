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

type ToolHandler = (args: unknown) => Promise<{
  content?: Array<{ text?: string }>;
  success?: boolean;
}>;

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

describe('tools: downloadArtifactByUrl branch coverage via download_build_artifacts', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('text encoding', () => {
    it('returns text content when axios returns string data', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: 'hello world text',
        headers: {
          'content-type': 'text/plain',
          'content-length': '16',
        },
      });
      const mockAdapter = { getAxios: () => ({ get: mockGet }) };

      const ArtifactManager = jest.fn().mockImplementation(() => ({}));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue(mockAdapter);
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) throw new Error('handler not found');

      const response = await handler({
        buildId: '123',
        artifactPaths: [
          { path: 'file.txt', buildId: '123', downloadUrl: 'https://tc.example/artifact.txt' },
        ],
        encoding: 'text',
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts[0].success).toBe(true);
      expect(payload.artifacts[0].encoding).toBe('text');
      expect(payload.artifacts[0].content).toBe('hello world text');
      expect(mockGet).toHaveBeenCalledWith('https://tc.example/artifact.txt', {
        responseType: 'text',
      });
    });

    it('throws when text encoding receives non-string data', async () => {
      const mockGet = jest
        .fn()
        .mockResolvedValueOnce({
          data: 'good content',
          headers: { 'content-type': 'text/plain', 'content-length': '12' },
        })
        .mockResolvedValueOnce({
          data: Buffer.from('not a string'),
          headers: { 'content-type': 'application/octet-stream' },
        });
      const mockAdapter = { getAxios: () => ({ get: mockGet }) };

      const ArtifactManager = jest.fn().mockImplementation(() => ({}));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue(mockAdapter);
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) throw new Error('handler not found');

      const response = await handler({
        buildId: '123',
        artifactPaths: [
          { path: 'good.txt', buildId: '123', downloadUrl: 'https://tc.example/good.txt' },
          { path: 'binary.bin', buildId: '123', downloadUrl: 'https://tc.example/binary.bin' },
        ],
        encoding: 'text',
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts[0].success).toBe(true);
      expect(payload.artifacts[1].success).toBe(false);
      expect(payload.artifacts[1].error).toContain('non-text payload');
    });
  });

  describe('base64 encoding with different payload types', () => {
    it('handles Buffer payload', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        data: Buffer.from('buffer data'),
        headers: { 'content-type': 'application/octet-stream', 'content-length': '11' },
      });
      const mockAdapter = { getAxios: () => ({ get: mockGet }) };

      const ArtifactManager = jest.fn().mockImplementation(() => ({}));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue(mockAdapter);
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) throw new Error('handler not found');

      const response = await handler({
        buildId: '123',
        artifactPaths: [
          { path: 'file.bin', buildId: '123', downloadUrl: 'https://tc.example/artifact.bin' },
        ],
        encoding: 'base64',
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts[0].success).toBe(true);
      expect(payload.artifacts[0].encoding).toBe('base64');
      expect(payload.artifacts[0].content).toBe(Buffer.from('buffer data').toString('base64'));
    });

    it('handles ArrayBuffer payload', async () => {
      const arrayBuffer = new ArrayBuffer(8);
      const view = new Uint8Array(arrayBuffer);
      view.set([1, 2, 3, 4, 5, 6, 7, 8]);

      const mockGet = jest.fn().mockResolvedValue({
        data: arrayBuffer,
        headers: { 'content-type': 'application/octet-stream' },
      });
      const mockAdapter = { getAxios: () => ({ get: mockGet }) };

      const ArtifactManager = jest.fn().mockImplementation(() => ({}));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue(mockAdapter);
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) throw new Error('handler not found');

      const response = await handler({
        buildId: '123',
        artifactPaths: [
          { path: 'file.bin', buildId: '123', downloadUrl: 'https://tc.example/artifact.bin' },
        ],
        encoding: 'base64',
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts[0].success).toBe(true);
      expect(payload.artifacts[0].encoding).toBe('base64');
      expect(Buffer.from(payload.artifacts[0].content, 'base64')).toEqual(
        Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])
      );
    });

    it('handles ArrayBufferView (Uint8Array) payload', async () => {
      const uint8 = new Uint8Array([10, 20, 30, 40, 50]);

      const mockGet = jest.fn().mockResolvedValue({
        data: uint8,
        headers: { 'content-type': 'application/octet-stream' },
      });
      const mockAdapter = { getAxios: () => ({ get: mockGet }) };

      const ArtifactManager = jest.fn().mockImplementation(() => ({}));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue(mockAdapter);
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) throw new Error('handler not found');

      const response = await handler({
        buildId: '123',
        artifactPaths: [
          { path: 'file.bin', buildId: '123', downloadUrl: 'https://tc.example/artifact.bin' },
        ],
        encoding: 'base64',
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts[0].success).toBe(true);
      expect(payload.artifacts[0].encoding).toBe('base64');
    });

    it('throws on unexpected binary payload type', async () => {
      const mockGet = jest
        .fn()
        .mockResolvedValueOnce({
          data: Buffer.from('good'),
          headers: { 'content-type': 'application/octet-stream' },
        })
        .mockResolvedValueOnce({
          data: { not: 'a buffer' },
          headers: { 'content-type': 'application/octet-stream' },
        });
      const mockAdapter = { getAxios: () => ({ get: mockGet }) };

      const ArtifactManager = jest.fn().mockImplementation(() => ({}));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue(mockAdapter);
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) throw new Error('handler not found');

      const response = await handler({
        buildId: '123',
        artifactPaths: [
          { path: 'good.bin', buildId: '123', downloadUrl: 'https://tc.example/good.bin' },
          { path: 'bad.bin', buildId: '123', downloadUrl: 'https://tc.example/bad.bin' },
        ],
        encoding: 'base64',
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts[0].success).toBe(true);
      expect(payload.artifacts[1].success).toBe(false);
      expect(payload.artifacts[1].error).toContain('unexpected binary payload');
    });
  });

  describe('maxSize validation', () => {
    it('throws when content-length exceeds maxSize', async () => {
      const mockGet = jest
        .fn()
        .mockResolvedValueOnce({
          data: 'ok',
          headers: { 'content-type': 'text/plain', 'content-length': '2' },
        })
        .mockResolvedValueOnce({
          data: 'this will be rejected',
          headers: { 'content-type': 'text/plain', 'content-length': '1000' },
        });
      const mockAdapter = { getAxios: () => ({ get: mockGet }) };

      const ArtifactManager = jest.fn().mockImplementation(() => ({}));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue(mockAdapter);
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) throw new Error('handler not found');

      const response = await handler({
        buildId: '123',
        artifactPaths: [
          { path: 'small.txt', buildId: '123', downloadUrl: 'https://tc.example/small.txt' },
          { path: 'large.txt', buildId: '123', downloadUrl: 'https://tc.example/large.txt' },
        ],
        encoding: 'text',
        maxSize: 100,
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts[0].success).toBe(true);
      expect(payload.artifacts[1].success).toBe(false);
      expect(payload.artifacts[1].error).toContain('exceeds maximum allowed size');
      expect(payload.artifacts[1].error).toContain('1000');
    });

    it('throws when text size exceeds maxSize', async () => {
      const largeText = 'x'.repeat(200);
      const mockGet = jest
        .fn()
        .mockResolvedValueOnce({
          data: 'ok',
          headers: { 'content-type': 'text/plain' },
        })
        .mockResolvedValueOnce({
          data: largeText,
          headers: { 'content-type': 'text/plain' },
        });
      const mockAdapter = { getAxios: () => ({ get: mockGet }) };

      const ArtifactManager = jest.fn().mockImplementation(() => ({}));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue(mockAdapter);
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) throw new Error('handler not found');

      const response = await handler({
        buildId: '123',
        artifactPaths: [
          { path: 'small.txt', buildId: '123', downloadUrl: 'https://tc.example/small.txt' },
          { path: 'large.txt', buildId: '123', downloadUrl: 'https://tc.example/large.txt' },
        ],
        encoding: 'text',
        maxSize: 100,
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts[0].success).toBe(true);
      expect(payload.artifacts[1].success).toBe(false);
      expect(payload.artifacts[1].error).toContain('exceeds maximum allowed size');
    });

    it('throws when buffer size exceeds maxSize', async () => {
      const largeBuffer = Buffer.alloc(200);
      const mockGet = jest
        .fn()
        .mockResolvedValueOnce({
          data: Buffer.from('ok'),
          headers: { 'content-type': 'application/octet-stream' },
        })
        .mockResolvedValueOnce({
          data: largeBuffer,
          headers: { 'content-type': 'application/octet-stream' },
        });
      const mockAdapter = { getAxios: () => ({ get: mockGet }) };

      const ArtifactManager = jest.fn().mockImplementation(() => ({}));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue(mockAdapter);
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) throw new Error('handler not found');

      const response = await handler({
        buildId: '123',
        artifactPaths: [
          { path: 'small.bin', buildId: '123', downloadUrl: 'https://tc.example/small.bin' },
          { path: 'large.bin', buildId: '123', downloadUrl: 'https://tc.example/large.bin' },
        ],
        encoding: 'base64',
        maxSize: 100,
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts[0].success).toBe(true);
      expect(payload.artifacts[1].success).toBe(false);
      expect(payload.artifacts[1].error).toContain('exceeds maximum allowed size');
    });
  });

  describe('stream encoding', () => {
    it('throws when stream encoding receives non-stream data', async () => {
      const mockGet = jest
        .fn()
        .mockResolvedValueOnce({
          data: Readable.from(['stream', 'data']),
          headers: { 'content-type': 'application/octet-stream', 'content-length': '10' },
        })
        .mockResolvedValueOnce({
          data: 'not a stream',
          headers: { 'content-type': 'text/plain' },
        });
      const mockAdapter = { getAxios: () => ({ get: mockGet }) };

      const ArtifactManager = jest.fn().mockImplementation(() => ({}));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue(mockAdapter);
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) throw new Error('handler not found');

      const targetDir = join(tmpdir(), `artifact-stream-test-${Date.now()}`);
      await fs.mkdir(targetDir, { recursive: true });

      try {
        const response = await handler({
          buildId: '123',
          artifactPaths: [
            {
              path: 'good-stream.bin',
              buildId: '123',
              downloadUrl: 'https://tc.example/good-stream.bin',
            },
            {
              path: 'not-stream.txt',
              buildId: '123',
              downloadUrl: 'https://tc.example/not-stream.txt',
            },
          ],
          encoding: 'stream',
          outputDir: targetDir,
        });

        const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
        expect(payload.artifacts[0].success).toBe(true);
        expect(payload.artifacts[1].success).toBe(false);
        expect(payload.artifacts[1].error).toContain('readable stream');
      } finally {
        await fs.rm(targetDir, { recursive: true, force: true });
      }
    });

    it('streams artifact to disk via downloadUrl', async () => {
      const streamData = Readable.from(['hello', ' ', 'from', ' ', 'url']);
      const mockGet = jest.fn().mockResolvedValue({
        data: streamData,
        headers: { 'content-type': 'application/octet-stream', 'content-length': '15' },
      });
      const mockAdapter = { getAxios: () => ({ get: mockGet }) };

      const ArtifactManager = jest.fn().mockImplementation(() => ({}));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue(mockAdapter);
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) throw new Error('handler not found');

      const targetDir = join(tmpdir(), `artifact-stream-url-${Date.now()}`);
      await fs.mkdir(targetDir, { recursive: true });

      try {
        const response = await handler({
          buildId: '123',
          artifactPaths: [
            {
              path: 'streamed.bin',
              buildId: '123',
              downloadUrl: 'https://tc.example/streamed.bin',
            },
          ],
          encoding: 'stream',
          outputDir: targetDir,
        });

        const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
        expect(payload.artifacts[0].success).toBe(true);
        expect(payload.artifacts[0].encoding).toBe('stream');
        expect(payload.artifacts[0].outputPath).toBeDefined();

        const written = await fs.readFile(payload.artifacts[0].outputPath, 'utf8');
        expect(written).toBe('hello from url');
      } finally {
        await fs.rm(targetDir, { recursive: true, force: true });
      }
    });
  });
});
