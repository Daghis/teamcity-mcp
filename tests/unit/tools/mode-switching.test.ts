/**
 * Tests for runtime MCP mode switching
 * Validates get_mcp_mode and set_mcp_mode tools
 */
// Import directly for config function tests (these test actual state changes)
import {
  getMCPMode,
  getServerInstance,
  resetMCPMode,
  setMCPMode,
  setServerInstance,
} from '@/config';

describe('runtime mode switching', () => {
  const originalMCPMode = process.env['MCP_MODE'];

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    // Reset both env var and runtime state before each test
    delete process.env['MCP_MODE'];
    resetMCPMode();
  });

  afterEach(() => {
    // Clean up after each test
    resetMCPMode();
    // Restore original env var
    if (originalMCPMode !== undefined) {
      process.env['MCP_MODE'] = originalMCPMode;
    } else {
      delete process.env['MCP_MODE'];
    }
  });

  describe('config functions', () => {
    it('getMCPMode returns runtime override when set', () => {
      // Default is dev
      expect(getMCPMode()).toBe('dev');

      // Set to full
      setMCPMode('full');
      expect(getMCPMode()).toBe('full');

      // Reset to default
      resetMCPMode();
      expect(getMCPMode()).toBe('dev');
    });

    it('setServerInstance and getServerInstance work correctly', () => {
      // Set mock server
      const mockServer = {
        sendToolListChanged: jest.fn(),
      } as unknown as import('@modelcontextprotocol/sdk/server/index.js').Server;
      setServerInstance(mockServer);
      expect(getServerInstance()).toBe(mockServer);
    });
  });

  describe('get_mcp_mode tool', () => {
    it('returns current mode and tool count', async () => {
      jest.doMock('@/config', () => ({
        getTeamCityUrl: () => 'https://example.test',
        getTeamCityToken: () => 'token',
        getMCPMode: () => 'dev',
        setMCPMode: jest.fn(),
        getServerInstance: () => null,
        setServerInstance: jest.fn(),
        resetMCPMode: jest.fn(),
      }));

      await jest.isolateModulesAsync(async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getTool } = require('@/tools');
        const tool = getTool('get_mcp_mode');
        expect(tool).toBeDefined();

        const result = await tool.handler({});
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.mode).toBe('dev');
        expect(typeof parsed.toolCount).toBe('number');
        expect(parsed.toolCount).toBeGreaterThan(0);
      });
    });
  });

  describe('set_mcp_mode tool', () => {
    it('switches mode and calls sendToolListChanged', async () => {
      const mockSendToolListChanged = jest.fn().mockResolvedValue(undefined);
      const mockServer = { sendToolListChanged: mockSendToolListChanged };
      const mockSetMCPMode = jest.fn();

      jest.doMock('@/config', () => ({
        getTeamCityUrl: () => 'https://example.test',
        getTeamCityToken: () => 'token',
        getMCPMode: () => 'dev',
        setMCPMode: mockSetMCPMode,
        getServerInstance: () => mockServer,
        setServerInstance: jest.fn(),
        resetMCPMode: jest.fn(),
      }));

      await jest.isolateModulesAsync(async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getTool } = require('@/tools');
        const tool = getTool('set_mcp_mode');
        expect(tool).toBeDefined();

        const result = await tool.handler({ mode: 'full' });
        expect(mockSetMCPMode).toHaveBeenCalledWith('full');
        expect(mockSendToolListChanged).toHaveBeenCalledTimes(1);

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.previousMode).toBe('dev');
        expect(parsed.currentMode).toBe('full');
        expect(parsed.message).toContain('Mode switched');
      });
    });

    it('handles missing server gracefully', async () => {
      const mockSetMCPMode = jest.fn();

      jest.doMock('@/config', () => ({
        getTeamCityUrl: () => 'https://example.test',
        getTeamCityToken: () => 'token',
        getMCPMode: () => 'dev',
        setMCPMode: mockSetMCPMode,
        getServerInstance: () => null, // No server registered
        setServerInstance: jest.fn(),
        resetMCPMode: jest.fn(),
      }));

      await jest.isolateModulesAsync(async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getTool } = require('@/tools');
        const tool = getTool('set_mcp_mode');

        // Should not throw even without server
        const result = await tool.handler({ mode: 'full' });
        expect(mockSetMCPMode).toHaveBeenCalledWith('full');

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.currentMode).toBe('full');
      });
    });
  });

  describe('tool availability after mode switch', () => {
    it('get_mcp_mode is available in both modes', () => {
      // Test dev mode
      jest.doMock('@/config', () => ({
        getTeamCityUrl: () => 'https://example.test',
        getTeamCityToken: () => 'token',
        getMCPMode: () => 'dev',
        setMCPMode: jest.fn(),
        getServerInstance: () => null,
        setServerInstance: jest.fn(),
        resetMCPMode: jest.fn(),
      }));

      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getTool } = require('@/tools');
        expect(getTool('get_mcp_mode')).toBeDefined();
      });

      jest.resetModules();

      // Test full mode
      jest.doMock('@/config', () => ({
        getTeamCityUrl: () => 'https://example.test',
        getTeamCityToken: () => 'token',
        getMCPMode: () => 'full',
        setMCPMode: jest.fn(),
        getServerInstance: () => null,
        setServerInstance: jest.fn(),
        resetMCPMode: jest.fn(),
      }));

      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getTool } = require('@/tools');
        expect(getTool('get_mcp_mode')).toBeDefined();
      });
    });

    it('set_mcp_mode is available in both modes', () => {
      // Test dev mode
      jest.doMock('@/config', () => ({
        getTeamCityUrl: () => 'https://example.test',
        getTeamCityToken: () => 'token',
        getMCPMode: () => 'dev',
        setMCPMode: jest.fn(),
        getServerInstance: () => null,
        setServerInstance: jest.fn(),
        resetMCPMode: jest.fn(),
      }));

      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getTool } = require('@/tools');
        expect(getTool('set_mcp_mode')).toBeDefined();
      });

      jest.resetModules();

      // Test full mode
      jest.doMock('@/config', () => ({
        getTeamCityUrl: () => 'https://example.test',
        getTeamCityToken: () => 'token',
        getMCPMode: () => 'full',
        setMCPMode: jest.fn(),
        getServerInstance: () => null,
        setServerInstance: jest.fn(),
        resetMCPMode: jest.fn(),
      }));

      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getTool } = require('@/tools');
        expect(getTool('set_mcp_mode')).toBeDefined();
      });
    });
  });
});
