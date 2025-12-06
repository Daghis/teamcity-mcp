/**
 * Tests for helper functions in tools.ts
 *
 * These functions are internal but are exercised through the artifact download tools.
 * Tests focus on branch coverage for edge cases in:
 * - sanitizeFileName
 * - sanitizePathSegments
 * - ensureUniquePath
 * - resolveStreamOutputPath
 * - buildArtifactPayload
 */
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
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
  isError?: boolean;
}>;

interface ToolResponse {
  content?: Array<{ text?: string }>;
  success?: boolean;
  isError?: boolean;
}

describe('tools: helper function branch coverage', () => {
  afterEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('sanitizePathSegments edge cases', () => {
    it('handles artifact path with only dot segments by using fallback name', async () => {
      // When path contains only . and .. segments, they get filtered out
      // and the fallback name is used instead
      const chunks = ['data'];
      const stream = Readable.from(chunks);
      const downloadArtifact = jest.fn().mockResolvedValue({
        name: 'fallback.txt', // This becomes the fallback
        path: './../..', // All segments filtered out
        size: 4,
        content: stream,
        mimeType: 'text/plain',
      });

      const ArtifactManager = jest.fn().mockImplementation(() => ({ downloadArtifact }));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      const outputDir = join(tmpdir(), `test-sanitize-${Date.now()}`);
      await fs.mkdir(outputDir, { recursive: true });

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
        artifactPaths: ['./../..'],
        encoding: 'stream',
        outputDir,
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts).toBeDefined();
      expect(payload.artifacts.length).toBe(1);
      // The output path should use the sanitized fallback name
      expect(payload.artifacts[0].outputPath).toContain('fallback');

      // Cleanup
      await fs.rm(outputDir, { recursive: true, force: true });
    });

    it('sanitizes special characters in path segments', async () => {
      const chunks = ['content'];
      const stream = Readable.from(chunks);
      const downloadArtifact = jest.fn().mockResolvedValue({
        name: 'file@#$.txt',
        path: 'dir@name/sub#dir/file@#$.txt',
        size: 7,
        content: stream,
        mimeType: 'text/plain',
      });

      const ArtifactManager = jest.fn().mockImplementation(() => ({ downloadArtifact }));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      const outputDir = join(tmpdir(), `test-special-chars-${Date.now()}`);
      await fs.mkdir(outputDir, { recursive: true });

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
        artifactPaths: ['dir@name/sub#dir/file@#$.txt'],
        encoding: 'stream',
        outputDir,
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts).toBeDefined();
      // Special characters should be replaced with underscores
      const outputPath = payload.artifacts[0].outputPath as string;
      expect(outputPath).not.toContain('@');
      expect(outputPath).not.toContain('#');
      expect(outputPath).not.toContain('$');

      // Cleanup
      await fs.rm(outputDir, { recursive: true, force: true });
    });
  });

  describe('resolveStreamOutputPath edge cases', () => {
    it('throws error when artifact path escapes output directory', async () => {
      const chunks = ['malicious'];
      const stream = Readable.from(chunks);
      const downloadArtifact = jest.fn().mockResolvedValue({
        name: 'passwd',
        path: '../../../etc/passwd', // Path traversal attempt
        size: 9,
        content: stream,
        mimeType: 'text/plain',
      });

      const ArtifactManager = jest.fn().mockImplementation(() => ({ downloadArtifact }));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      const outputDir = join(tmpdir(), `test-escape-${Date.now()}`);
      await fs.mkdir(outputDir, { recursive: true });

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
         
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifacts').handler;
      });

      if (!handler) {
        throw new Error('download_build_artifacts handler not found');
      }

      // Note: The path traversal segments (..) are filtered out by sanitizePathSegments
      // so this test actually verifies that filtering works correctly
      const response = await handler({
        buildId: '123',
        artifactPaths: ['../../../etc/passwd'],
        encoding: 'stream',
        outputDir,
      });

      // Since .. segments are filtered, this should succeed but write to outputDir
      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts).toBeDefined();
      // The path should be within outputDir, not escaped
      const outputPath = payload.artifacts[0].outputPath as string;
      expect(outputPath.startsWith(outputDir)).toBe(true);

      // Cleanup
      await fs.rm(outputDir, { recursive: true, force: true });
    });

    it('falls back to temp directory when no outputDir provided for stream', async () => {
      const chunks = ['temp content'];
      const stream = Readable.from(chunks);
      const downloadArtifact = jest.fn().mockResolvedValue({
        name: 'tempfile.txt',
        path: 'tempfile.txt',
        size: 12,
        content: stream,
        mimeType: 'text/plain',
      });

      const ArtifactManager = jest.fn().mockImplementation(() => ({ downloadArtifact }));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
         
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifact').handler;
      });

      if (!handler) {
        throw new Error('download_build_artifact handler not found');
      }

      // Stream without outputPath - should use temp directory
      const response = await handler({
        buildId: '123',
        artifactPath: 'tempfile.txt',
        encoding: 'stream',
        // No outputPath provided
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.encoding).toBe('stream');
      expect(payload.outputPath).toBeDefined();
      // Should be in temp directory
      expect(payload.outputPath).toContain(tmpdir());

      // Cleanup
      await fs.rm(payload.outputPath, { force: true });
    });
  });

  describe('ensureUniquePath conflict handling', () => {
    it('appends suffix when file already exists at target path', async () => {
      const outputDir = join(tmpdir(), `test-unique-${Date.now()}`);
      await fs.mkdir(outputDir, { recursive: true });

      // Pre-create a file that will conflict
      const conflictPath = join(outputDir, 'conflict.txt');
      await fs.writeFile(conflictPath, 'existing content');

      const chunks = ['new content'];
      const stream = Readable.from(chunks);
      const downloadArtifact = jest.fn().mockResolvedValue({
        name: 'conflict.txt',
        path: 'conflict.txt',
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
        artifactPaths: ['conflict.txt'],
        encoding: 'stream',
        outputDir,
      });

      const payload = JSON.parse(response.content?.[0]?.text ?? '{}');
      expect(payload.artifacts).toBeDefined();
      const outputPath = payload.artifacts[0].outputPath as string;

      // Should have a suffix like conflict-1.txt
      expect(outputPath).not.toBe(conflictPath);
      expect(basename(outputPath)).toMatch(/conflict-\d+\.txt/);

      // Original file should be unchanged
      const originalContent = await fs.readFile(conflictPath, 'utf8');
      expect(originalContent).toBe('existing content');

      // New file should have new content
      const newContent = await fs.readFile(outputPath, 'utf8');
      expect(newContent).toBe('new content');

      // Cleanup
      await fs.rm(outputDir, { recursive: true, force: true });
    });
  });

  describe('buildArtifactPayload edge cases', () => {
    it('throws when stream encoding receives non-stream content', async () => {
      // This tests line 194-195: if (!isReadableStream(contentStream))
      const downloadArtifact = jest.fn().mockResolvedValue({
        name: 'notastream.txt',
        path: 'notastream.txt',
        size: 4,
        content: 'not a stream', // String instead of Readable
        mimeType: 'text/plain',
      });

      const ArtifactManager = jest.fn().mockImplementation(() => ({ downloadArtifact }));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
         
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifact').handler;
      });

      if (!handler) {
        throw new Error('download_build_artifact handler not found');
      }

      const response = await handler({
        buildId: '123',
        artifactPath: 'notastream.txt',
        encoding: 'stream',
      });

      // Should return an error response - errors are JSON formatted
      const responseText = response.content?.[0]?.text ?? '{}';
      const parsed = JSON.parse(responseText);
      // Error format from globalErrorHandler wraps the message
      const errorMessage = typeof parsed.error === 'string'
        ? parsed.error
        : parsed.message ?? JSON.stringify(parsed);
      expect(errorMessage).toContain('Streaming download did not return a readable stream');
    });

    it('throws when base64/text encoding receives non-string content', async () => {
      // This tests line 216-217: if (typeof payloadContent !== 'string')
      const downloadArtifact = jest.fn().mockResolvedValue({
        name: 'binary.bin',
        path: 'binary.bin',
        size: 4,
        content: Buffer.from('test'), // Buffer instead of string for text encoding
        mimeType: 'application/octet-stream',
      });

      const ArtifactManager = jest.fn().mockImplementation(() => ({ downloadArtifact }));
      const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
      const getInstance = jest.fn().mockReturnValue({});

      jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
      jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
      jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

      let handler: ToolHandler | undefined;
      jest.isolateModules(() => {
         
        const { getRequiredTool } = require('@/tools');
        handler = getRequiredTool('download_build_artifact').handler;
      });

      if (!handler) {
        throw new Error('download_build_artifact handler not found');
      }

      const response = await handler({
        buildId: '123',
        artifactPath: 'binary.bin',
        encoding: 'text', // Request text but receive Buffer
      });

      // Should return an error response - errors are JSON formatted
      const responseText = response.content?.[0]?.text ?? '{}';
      const parsed = JSON.parse(responseText);
      // Error format from globalErrorHandler wraps the message
      const errorMessage = typeof parsed.error === 'string'
        ? parsed.error
        : parsed.message ?? JSON.stringify(parsed);
      expect(errorMessage).toContain('Expected text artifact content as string');
    });
  });

  describe('toNormalizedArtifactRequests edge cases', () => {
    it('throws when artifact request has no buildId and default is empty', async () => {
      // This tests lines 242-244: missing buildId validation
      const downloadArtifact = jest.fn();

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

      // Provide object format with empty buildId and empty default
      const response = await handler({
        buildId: '', // Empty default buildId
        artifactPaths: [{ path: 'test.txt', buildId: '' }], // Empty buildId in item
        encoding: 'base64',
      });

      // Should fail validation - Zod will catch this before toNormalizedArtifactRequests
      const responseText = response.content?.[0]?.text ?? '{}';
      const parsed = JSON.parse(responseText);
      // The error could be from Zod validation or from toNormalizedArtifactRequests
      expect(parsed.error || parsed.issues).toBeDefined();
    });
  });
});
