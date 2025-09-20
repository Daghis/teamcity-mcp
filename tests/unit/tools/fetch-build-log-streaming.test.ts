import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

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

describe('tools: fetch_build_log streaming', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('streams build log content to the requested path', async () => {
    const chunks = ['line 1\n', 'line 2\n', 'line 3\n'];
    const stream = Readable.from(chunks);

    const downloadBuildLogContent = jest.fn().mockResolvedValue({
      data: stream,
    });
    const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({
      downloadBuildLogContent,
    });
    const getInstance = jest.fn().mockReturnValue({});

    jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
    jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

    let handler:
      | ((args: unknown) => Promise<{ content?: Array<{ text?: string }>; success?: boolean }>)
      | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getRequiredTool } = require('@/tools');
      handler = getRequiredTool('fetch_build_log').handler;
    });

    if (!handler) {
      throw new Error('fetch_build_log handler not found');
    }

    const targetPath = join(tmpdir(), `fetch-log-${Date.now()}.log`);

    try {
      const response = await handler({
        buildId: '123',
        encoding: 'stream',
        outputPath: targetPath,
        lineCount: 3,
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.encoding).toBe('stream');
      expect(payload.outputPath).toBe(targetPath);
      expect(payload.meta).toMatchObject({ buildId: '123', pageSize: 3, startLine: 0 });

      expect(downloadBuildLogContent).toHaveBeenCalledTimes(1);
      const [, options] = downloadBuildLogContent.mock.calls[0] ?? [];
      expect(options).toMatchObject({
        params: { start: 0, count: 3 },
        responseType: 'stream',
      });

      const written = await fs.readFile(targetPath, 'utf8');
      expect(written).toBe(chunks.join(''));
    } finally {
      await fs.rm(targetPath, { force: true });
    }
  });
});
