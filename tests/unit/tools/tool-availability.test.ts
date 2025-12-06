/**
 * Tests for tool availability functions: getAvailableTools, getTool, getRequiredTool
 * Validates mode filtering behavior (dev vs full)
 */

describe('tool availability - mode filtering', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('getAvailableTools', () => {
    it('returns only non-full tools in dev mode', () => {
      jest.doMock('@/config', () => ({
        getTeamCityUrl: () => 'https://example.test',
        getTeamCityToken: () => 'token',
        getMCPMode: () => 'dev',
      }));

      jest.isolateModules(() => {
         
        const { getAvailableTools } = require('@/tools');
        const tools = getAvailableTools();

        // In dev mode, no tool should have mode: 'full'
        const fullModeTools = tools.filter(
          (t: { mode?: 'dev' | 'full' }) => t.mode === 'full'
        );
        expect(fullModeTools).toHaveLength(0);

        // Should have some tools available (dev tools without mode: 'full')
        expect(tools.length).toBeGreaterThan(0);

        // Verify some expected dev tools are present
        const toolNames = tools.map((t: { name: string }) => t.name);
        expect(toolNames).toContain('get_build');
        expect(toolNames).toContain('list_builds');
        expect(toolNames).toContain('fetch_build_log');
      });
    });

    it('returns all tools including full-mode tools in full mode', () => {
      jest.doMock('@/config', () => ({
        getTeamCityUrl: () => 'https://example.test',
        getTeamCityToken: () => 'token',
        getMCPMode: () => 'full',
      }));

      jest.isolateModules(() => {
         
        const { getAvailableTools } = require('@/tools');
        const tools = getAvailableTools();

        // In full mode, should have more tools than dev mode
        expect(tools.length).toBeGreaterThan(10);

        // Verify full-mode tools are present
        const toolNames = tools.map((t: { name: string }) => t.name);
        expect(toolNames).toContain('trigger_build');
        expect(toolNames).toContain('cancel_queued_build');
        expect(toolNames).toContain('create_project');
        expect(toolNames).toContain('delete_project');
      });
    });

    it('deduplicates tools by name in full mode', () => {
      jest.doMock('@/config', () => ({
        getTeamCityUrl: () => 'https://example.test',
        getTeamCityToken: () => 'token',
        getMCPMode: () => 'full',
      }));

      jest.isolateModules(() => {
         
        const { getAvailableTools } = require('@/tools');
        const tools = getAvailableTools();
        const names = tools.map((t: { name: string }) => t.name);
        const uniqueNames = new Set(names);

        // All tool names should be unique
        expect(names.length).toBe(uniqueNames.size);
      });
    });
  });

  describe('getTool', () => {
    it('returns tool when available in current mode', () => {
      jest.doMock('@/config', () => ({
        getTeamCityUrl: () => 'https://example.test',
        getTeamCityToken: () => 'token',
        getMCPMode: () => 'full',
      }));

      jest.isolateModules(() => {
         
        const { getTool } = require('@/tools');
        const tool = getTool('get_build');
        expect(tool).toBeDefined();
        expect(tool.name).toBe('get_build');
      });
    });

    it('returns undefined for non-existent tool', () => {
      jest.doMock('@/config', () => ({
        getTeamCityUrl: () => 'https://example.test',
        getTeamCityToken: () => 'token',
        getMCPMode: () => 'full',
      }));

      jest.isolateModules(() => {
         
        const { getTool } = require('@/tools');
        const tool = getTool('non_existent_tool_xyz123');
        expect(tool).toBeUndefined();
      });
    });

    it('returns undefined for full-mode tool in dev mode', () => {
      jest.doMock('@/config', () => ({
        getTeamCityUrl: () => 'https://example.test',
        getTeamCityToken: () => 'token',
        getMCPMode: () => 'dev',
      }));

      jest.isolateModules(() => {
         
        const { getTool } = require('@/tools');
        // create_project is a full-mode only tool (in FULL_MODE_TOOLS array)
        const tool = getTool('create_project');
        expect(tool).toBeUndefined();
      });
    });
  });

  describe('getRequiredTool', () => {
    it('returns tool when available', () => {
      jest.doMock('@/config', () => ({
        getTeamCityUrl: () => 'https://example.test',
        getTeamCityToken: () => 'token',
        getMCPMode: () => 'full',
      }));

      jest.isolateModules(() => {
         
        const { getRequiredTool } = require('@/tools');
        const tool = getRequiredTool('get_build');
        expect(tool).toBeDefined();
        expect(tool.name).toBe('get_build');
      });
    });

    it('throws descriptive error for non-existent tool', () => {
      jest.doMock('@/config', () => ({
        getTeamCityUrl: () => 'https://example.test',
        getTeamCityToken: () => 'token',
        getMCPMode: () => 'full',
      }));

      jest.isolateModules(() => {
         
        const { getRequiredTool } = require('@/tools');
        expect(() => getRequiredTool('fake_tool_abc')).toThrow(
          'Tool not available in full mode or not registered: fake_tool_abc'
        );
      });
    });

    it('throws error mentioning dev mode when tool unavailable', () => {
      jest.doMock('@/config', () => ({
        getTeamCityUrl: () => 'https://example.test',
        getTeamCityToken: () => 'token',
        getMCPMode: () => 'dev',
      }));

      jest.isolateModules(() => {
         
        const { getRequiredTool } = require('@/tools');
        // create_project is only in full mode (FULL_MODE_TOOLS array)
        expect(() => getRequiredTool('create_project')).toThrow(
          'Tool not available in dev mode or not registered: create_project'
        );
      });
    });
  });

  describe('getToolNames', () => {
    it('returns array of tool names for current mode', () => {
      jest.doMock('@/config', () => ({
        getTeamCityUrl: () => 'https://example.test',
        getTeamCityToken: () => 'token',
        getMCPMode: () => 'dev',
      }));

      jest.isolateModules(() => {
         
        const { getToolNames } = require('@/tools');
        const names = getToolNames();

        expect(Array.isArray(names)).toBe(true);
        expect(names.length).toBeGreaterThan(0);
        expect(names.every((n: unknown) => typeof n === 'string')).toBe(true);

        // Should not include full-mode only tools in dev mode
        // (create_project and delete_project are in FULL_MODE_TOOLS)
        expect(names).not.toContain('create_project');
        expect(names).not.toContain('delete_project');
      });
    });

    it('returns more tools in full mode than dev mode', () => {
      let devModeNames: string[] = [];
      let fullModeNames: string[] = [];

      jest.doMock('@/config', () => ({
        getTeamCityUrl: () => 'https://example.test',
        getTeamCityToken: () => 'token',
        getMCPMode: () => 'dev',
      }));

      jest.isolateModules(() => {
         
        const { getToolNames } = require('@/tools');
        devModeNames = getToolNames();
      });

      jest.resetModules();

      jest.doMock('@/config', () => ({
        getTeamCityUrl: () => 'https://example.test',
        getTeamCityToken: () => 'token',
        getMCPMode: () => 'full',
      }));

      jest.isolateModules(() => {
         
        const { getToolNames } = require('@/tools');
        fullModeNames = getToolNames();
      });

      expect(fullModeNames.length).toBeGreaterThan(devModeNames.length);
    });
  });
});
