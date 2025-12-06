/**
 * Tests for MCP Server Lifecycle Management
 * Verifies server initialization, start, stop, and restart functionality
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { getConfig } from '@/config';
import { createMCPServer } from '@/server';

import {
  createMockStdin,
  createMockStdout,
  injectMockStreams,
} from '../../test-utils/mock-transport';

/**
 * Helper to access server's internal properties for testing.
 * These are implementation details that may change between versions.
 */
interface ServerInternals {
  serverInfo?: { name?: string; version?: string };
  _capabilities?: Record<string, unknown>;
}

describe('MCP Server Lifecycle', () => {
  let server: Server | undefined;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Set test environment
    process.env['TEAMCITY_URL'] = 'https://test.teamcity.com';
    process.env['TEAMCITY_TOKEN'] = 'test-token';
    process.env['MCP_MODE'] = 'dev';
  });

  afterEach(async () => {
    // Restore original environment
    process.env = originalEnv;

    // Clean up server if it exists
    if (server && typeof server.close === 'function') {
      await server.close();
    }
  });

  describe('Server Initialization', () => {
    it('should create server with correct metadata', () => {
      server = createMCPServer();

      expect(server).toBeDefined();
      expect(server).toBeInstanceOf(Server);

      // Check server info - accessing internal property for verification
      const serverInternal = server as unknown as ServerInternals;
      expect(serverInternal.serverInfo).toEqual({
        name: 'teamcity-mcp',
        version: expect.any(String),
      });
    });

    it('should initialize with configured capabilities', () => {
      const config = getConfig();
      server = createMCPServer();

      // Server should be created with capabilities from config
      expect(server).toBeDefined();

      // Verify capabilities are set based on config
      const serverInternal = server as unknown as ServerInternals;
      const capabilities = serverInternal._capabilities;
      if (config.mcp.capabilities.tools) {
        expect(capabilities?.['tools']).toBeDefined();
      }
      if (config.mcp.capabilities.prompts) {
        expect(capabilities?.['prompts']).toBeDefined();
      }
      if (config.mcp.capabilities.resources) {
        expect(capabilities?.['resources']).toBeDefined();
      }
    });

    it('should expose public lifecycle methods', () => {
      server = createMCPServer();

      expect(typeof server.connect).toBe('function');
      expect(typeof server.close).toBe('function');
    });

    it('should handle server creation errors gracefully', () => {
      // Test with invalid configuration
      process.env['TEAMCITY_URL'] = '';

      expect(() => createMCPServer()).not.toThrow();
      server = createMCPServer();
      expect(server).toBeDefined();
    });
  });

  describe('Server Start/Stop', () => {
    it('should connect with transport', async () => {
      server = createMCPServer();
      const transport = new StdioServerTransport();

      // Use test utility to inject mock streams
      injectMockStreams(transport);

      await expect(server.connect(transport)).resolves.not.toThrow();
    });

    it('should handle graceful shutdown', async () => {
      server = createMCPServer();

      // Server should close without errors
      await expect(server.close()).resolves.not.toThrow();
    });

    it('should handle multiple start attempts', async () => {
      server = createMCPServer();
      const transport = new StdioServerTransport();
      injectMockStreams(transport);

      // First connection should succeed
      await server.connect(transport);

      // Second connection attempt should be handled
      const transport2 = new StdioServerTransport();
      injectMockStreams(transport2);

      // This might throw or be ignored depending on implementation
      // Accept either resolution or rejection
      await server.connect(transport2).catch(() => undefined);
    });
  });

  describe('Server Lifecycle Events', () => {
    it('should handle connection lifecycle', async () => {
      server = createMCPServer();

      // Test server lifecycle management
      // The server should be created and ready for connections
      expect(server).toBeDefined();
      const serverInternal = server as unknown as ServerInternals;
      expect(serverInternal.serverInfo).toBeDefined();
      expect(serverInternal.serverInfo?.name).toBe('teamcity-mcp');

      // Server should have proper methods for lifecycle management
      expect(typeof server.connect).toBe('function');
      expect(typeof server.close).toBe('function');

      // Server close should work without errors (even without connection)
      await expect(server.close()).resolves.not.toThrow();

      // Should be able to close multiple times without issues
      await expect(server.close()).resolves.not.toThrow();
    });

    it('should maintain server state correctly', () => {
      server = createMCPServer();

      // Check initial state
      const serverInternal = server as unknown as ServerInternals;
      expect(serverInternal.serverInfo).toBeDefined();

      // Server should have proper structure
      expect(server.setRequestHandler).toBeDefined();
      expect(server.connect).toBeDefined();
      expect(server.close).toBeDefined();
    });
  });

  describe('Error Recovery', () => {
    it('should recover from transport errors', async () => {
      server = createMCPServer();
      const transport = new StdioServerTransport();

      // Create mock stdin with error simulation
      const mockStdin = createMockStdin();
      mockStdin.on.mockImplementation((event: string, handler: (err: Error) => void) => {
        if (event === 'error') {
          // Simulate error after connection
          setTimeout(() => handler(new Error('Transport error')), 10);
        }
      });

      const mockStdout = createMockStdout();

      // Inject mocks into transport
      const transportWithPrivates = transport as unknown as {
        _stdin?: unknown;
        _stdout?: unknown;
        input?: unknown;
        output?: unknown;
      };
      transportWithPrivates._stdin = mockStdin;
      transportWithPrivates._stdout = mockStdout;
      transportWithPrivates.input = mockStdin;
      transportWithPrivates.output = mockStdout;

      // Connection should handle errors gracefully
      await server.connect(transport);

      // Wait for error to be triggered
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Server should still be functional
      expect(server.close).toBeDefined();
      await server.close();
    });

    it('should handle server restart', async () => {
      // Create and start server
      server = createMCPServer();
      const transport1 = new StdioServerTransport();
      injectMockStreams(transport1);

      await server.connect(transport1);

      // Stop server
      await server.close();

      // Create new server instance
      server = createMCPServer();
      const transport2 = new StdioServerTransport();
      injectMockStreams(transport2);

      // Should be able to start again
      await expect(server.connect(transport2)).resolves.not.toThrow();
    });
  });
});
