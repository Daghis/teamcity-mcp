/**
 * Tests for error handling in tools.ts
 *
 * Focus on getErrorMessage() branch coverage through the download_build_artifacts tool
 * which captures individual artifact download errors.
 */
import { AxiosError, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';

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

/**
 * Create a properly typed AxiosError for testing
 */
function createAxiosError(options: {
  status?: number;
  data?: unknown;
  message?: string;
  hasResponse?: boolean;
}): AxiosError {
  const error = new Error(options.message ?? 'Request failed') as AxiosError;
  error.isAxiosError = true;
  error.name = 'AxiosError';
  error.config = {} as InternalAxiosRequestConfig;
  error.toJSON = () => ({});

  if (options.hasResponse !== false && options.status !== undefined) {
    error.response = {
      status: options.status,
      statusText: 'Error',
      data: options.data,
      headers: {},
      config: {} as InternalAxiosRequestConfig,
    } as AxiosResponse;
  }

  return error;
}

describe('tools: getErrorMessage branch coverage', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('AxiosError handling', () => {
    it('formats AxiosError with string response data', async () => {
      const axiosError = createAxiosError({
        status: 404,
        data: 'Resource not found',
        message: 'Request failed with status code 404',
      });

      const downloadArtifact = jest.fn()
        .mockResolvedValueOnce({
          name: 'good.txt',
          path: 'good.txt',
          size: 4,
          content: 'good',
          mimeType: 'text/plain',
        })
        .mockRejectedValueOnce(axiosError);

      const ArtifactManager = jest.fn().mockImplementation(() => ({ downloadArtifact }));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
         
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) {
        throw new Error('download_build_artifacts handler not found');
      }

      const response = await handler({
        buildId: '123',
        artifactPaths: ['good.txt', 'missing.txt'],
        encoding: 'text',
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts).toBeDefined();
      expect(payload.artifacts.length).toBe(2);

      // First artifact should succeed
      expect(payload.artifacts[0].success).toBe(true);

      // Second artifact should fail with formatted error containing status and data
      expect(payload.artifacts[1].success).toBe(false);
      expect(payload.artifacts[1].error).toContain('HTTP 404');
      expect(payload.artifacts[1].error).toContain('Resource not found');
    });

    it('formats AxiosError with object response data', async () => {
      const axiosError = createAxiosError({
        status: 500,
        data: { error: 'Internal server error', code: 'INTERNAL_ERROR' },
        message: 'Request failed with status code 500',
      });

      const downloadArtifact = jest.fn()
        .mockResolvedValueOnce({
          name: 'good.txt',
          path: 'good.txt',
          size: 4,
          content: 'good',
          mimeType: 'text/plain',
        })
        .mockRejectedValueOnce(axiosError);

      const ArtifactManager = jest.fn().mockImplementation(() => ({ downloadArtifact }));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
         
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) {
        throw new Error('download_build_artifacts handler not found');
      }

      const response = await handler({
        buildId: '123',
        artifactPaths: ['good.txt', 'file.txt'],
        encoding: 'text',
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts).toBeDefined();
      expect(payload.artifacts[1].success).toBe(false);
      // Object data should be JSON stringified
      expect(payload.artifacts[1].error).toContain('HTTP 500');
      expect(payload.artifacts[1].error).toContain('Internal server error');
      expect(payload.artifacts[1].error).toContain('INTERNAL_ERROR');
    });

    it('handles AxiosError with unserializable response data', async () => {
      // Create an object with circular reference that can't be JSON stringified
      const circularData: Record<string, unknown> = { name: 'test' };
      circularData['self'] = circularData;

      const axiosError = createAxiosError({
        status: 500,
        data: circularData,
        message: 'Request failed',
      });

      const downloadArtifact = jest.fn()
        .mockResolvedValueOnce({
          name: 'good.txt',
          path: 'good.txt',
          size: 4,
          content: 'good',
          mimeType: 'text/plain',
        })
        .mockRejectedValueOnce(axiosError);

      const ArtifactManager = jest.fn().mockImplementation(() => ({ downloadArtifact }));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
         
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) {
        throw new Error('download_build_artifacts handler not found');
      }

      const response = await handler({
        buildId: '123',
        artifactPaths: ['good.txt', 'circular.txt'],
        encoding: 'text',
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts).toBeDefined();
      expect(payload.artifacts[1].success).toBe(false);
      // Unserializable data should use fallback message
      expect(payload.artifacts[1].error).toContain('HTTP 500');
      expect(payload.artifacts[1].error).toContain('[unserializable response body]');
    });

    it('handles AxiosError without response (network error)', async () => {
      const axiosError = createAxiosError({
        message: 'Network Error',
        hasResponse: false,
      });
      // Remove response property entirely
      delete (axiosError as Partial<AxiosError>).response;

      const downloadArtifact = jest.fn()
        .mockResolvedValueOnce({
          name: 'good.txt',
          path: 'good.txt',
          size: 4,
          content: 'good',
          mimeType: 'text/plain',
        })
        .mockRejectedValueOnce(axiosError);

      const ArtifactManager = jest.fn().mockImplementation(() => ({ downloadArtifact }));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
         
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) {
        throw new Error('download_build_artifacts handler not found');
      }

      const response = await handler({
        buildId: '123',
        artifactPaths: ['good.txt', 'network-error.txt'],
        encoding: 'text',
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts).toBeDefined();
      expect(payload.artifacts[1].success).toBe(false);
      // Should show "HTTP unknown" when no status
      expect(payload.artifacts[1].error).toContain('HTTP unknown');
    });

    it('handles AxiosError with undefined data', async () => {
      const axiosError = createAxiosError({
        status: 403,
        data: undefined,
        message: 'Forbidden',
      });

      const downloadArtifact = jest.fn()
        .mockResolvedValueOnce({
          name: 'good.txt',
          path: 'good.txt',
          size: 4,
          content: 'good',
          mimeType: 'text/plain',
        })
        .mockRejectedValueOnce(axiosError);

      const ArtifactManager = jest.fn().mockImplementation(() => ({ downloadArtifact }));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
         
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) {
        throw new Error('download_build_artifacts handler not found');
      }

      const response = await handler({
        buildId: '123',
        artifactPaths: ['good.txt', 'forbidden.txt'],
        encoding: 'text',
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts).toBeDefined();
      expect(payload.artifacts[1].success).toBe(false);
      // Should just show status without detail
      expect(payload.artifacts[1].error).toBe('HTTP 403');
    });
  });

  describe('non-AxiosError handling', () => {
    it('extracts message from plain Error object', async () => {
      const plainError = new Error('Plain error message');

      const downloadArtifact = jest.fn()
        .mockResolvedValueOnce({
          name: 'good.txt',
          path: 'good.txt',
          size: 4,
          content: 'good',
          mimeType: 'text/plain',
        })
        .mockRejectedValueOnce(plainError);

      const ArtifactManager = jest.fn().mockImplementation(() => ({ downloadArtifact }));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
         
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) {
        throw new Error('download_build_artifacts handler not found');
      }

      const response = await handler({
        buildId: '123',
        artifactPaths: ['good.txt', 'error.txt'],
        encoding: 'text',
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts).toBeDefined();
      expect(payload.artifacts[1].success).toBe(false);
      expect(payload.artifacts[1].error).toBe('Plain error message');
    });

    it('extracts message from object with message property', async () => {
      // Non-Error object with message property
      const errorLikeObject = { message: 'Error-like object message', code: 'ERR_001' };

      const downloadArtifact = jest.fn()
        .mockResolvedValueOnce({
          name: 'good.txt',
          path: 'good.txt',
          size: 4,
          content: 'good',
          mimeType: 'text/plain',
        })
        .mockRejectedValueOnce(errorLikeObject);

      const ArtifactManager = jest.fn().mockImplementation(() => ({ downloadArtifact }));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
         
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) {
        throw new Error('download_build_artifacts handler not found');
      }

      const response = await handler({
        buildId: '123',
        artifactPaths: ['good.txt', 'error-like.txt'],
        encoding: 'text',
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts).toBeDefined();
      expect(payload.artifacts[1].success).toBe(false);
      expect(payload.artifacts[1].error).toBe('Error-like object message');
    });

    it('converts string error to itself', async () => {
      const stringError = 'Simple string error';

      const downloadArtifact = jest.fn()
        .mockResolvedValueOnce({
          name: 'good.txt',
          path: 'good.txt',
          size: 4,
          content: 'good',
          mimeType: 'text/plain',
        })
        .mockRejectedValueOnce(stringError);

      const ArtifactManager = jest.fn().mockImplementation(() => ({ downloadArtifact }));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
         
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) {
        throw new Error('download_build_artifacts handler not found');
      }

      const response = await handler({
        buildId: '123',
        artifactPaths: ['good.txt', 'string-error.txt'],
        encoding: 'text',
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts).toBeDefined();
      expect(payload.artifacts[1].success).toBe(false);
      expect(payload.artifacts[1].error).toBe('Simple string error');
    });

    it('converts null/undefined to "Unknown error"', async () => {
      const downloadArtifact = jest.fn()
        .mockResolvedValueOnce({
          name: 'good.txt',
          path: 'good.txt',
          size: 4,
          content: 'good',
          mimeType: 'text/plain',
        })
        .mockRejectedValueOnce(null);

      const ArtifactManager = jest.fn().mockImplementation(() => ({ downloadArtifact }));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
         
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) {
        throw new Error('download_build_artifacts handler not found');
      }

      const response = await handler({
        buildId: '123',
        artifactPaths: ['good.txt', 'null-error.txt'],
        encoding: 'text',
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts).toBeDefined();
      expect(payload.artifacts[1].success).toBe(false);
      expect(payload.artifacts[1].error).toBe('Unknown error');
    });

    it('converts number to string', async () => {
      const downloadArtifact = jest.fn()
        .mockResolvedValueOnce({
          name: 'good.txt',
          path: 'good.txt',
          size: 4,
          content: 'good',
          mimeType: 'text/plain',
        })
        .mockRejectedValueOnce(42);

      const ArtifactManager = jest.fn().mockImplementation(() => ({ downloadArtifact }));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
         
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) {
        throw new Error('download_build_artifacts handler not found');
      }

      const response = await handler({
        buildId: '123',
        artifactPaths: ['good.txt', 'number-error.txt'],
        encoding: 'text',
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts).toBeDefined();
      expect(payload.artifacts[1].success).toBe(false);
      expect(payload.artifacts[1].error).toBe('42');
    });
  });
});
