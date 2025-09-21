/**
 * Tests for update_build_config tool
 * Verifies artifactRules uses settings/ path and other fields remain unchanged
 */
import type { ToolDefinition } from '@/tools';

// Force full mode for tools
process.env['MCP_MODE'] = 'full';

// Silence logger output in tests
jest.mock('@/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  getLogger: () => ({
    generateRequestId: () => 'test-req',
    logToolExecution: jest.fn(),
  }),
}));

// Mock TeamCityAPI to capture setBuildTypeField calls
const setBuildTypeField = jest.fn(async () => ({ data: 'OK' }));
const getBuildType = jest.fn(async () => ({
  data: {
    id: 'HoneycombHaven_ApiGatewayBuild',
    name: 'Old Name',
    description: 'Old description',
    project: { id: '_Root' },
    parameters: { property: [] },
    settings: { property: [] },
  },
}));
jest.mock('@/api-client', () => ({
  TeamCityAPI: {
    getInstance: jest.fn(() => ({
      buildTypes: {
        getBuildType,
        setBuildTypeField,
      },
    })),
  },
}));

describe('Tool: update_build_config', () => {
  beforeEach(() => {
    setBuildTypeField.mockClear();
  });

  it('uses settings/artifactRules for artifact rules update', async () => {
    const { getRequiredTool } = await import('../src/tools');
    const tool = getRequiredTool('update_build_config') as ToolDefinition;

    const args = {
      buildTypeId: 'HoneycombHaven_ApiGatewayBuild',
      name: 'New Name',
      description: 'New description',
      paused: true,
      artifactRules: 'dist/** => api-gateway-%build.number%.zip',
    };

    await tool.handler(args);

    // Assert individual field updates
    expect(setBuildTypeField).toHaveBeenCalledWith(
      'HoneycombHaven_ApiGatewayBuild',
      'name',
      'New Name'
    );
    expect(setBuildTypeField).toHaveBeenCalledWith(
      'HoneycombHaven_ApiGatewayBuild',
      'description',
      'New description'
    );
    expect(setBuildTypeField).toHaveBeenCalledWith(
      'HoneycombHaven_ApiGatewayBuild',
      'paused',
      'true'
    );
    expect(setBuildTypeField).toHaveBeenCalledWith(
      'HoneycombHaven_ApiGatewayBuild',
      'settings/artifactRules',
      'dist/** => api-gateway-%build.number%.zip'
    );
  });

  it('retries artifact rules update using legacy field when needed', async () => {
    const { getRequiredTool } = await import('../src/tools');
    const tool = getRequiredTool('update_build_config') as ToolDefinition;

    const args = {
      buildTypeId: 'HoneycombHaven_ApiGatewayBuild',
      artifactRules: 'dist/** => legacy.zip',
    };

    setBuildTypeField.mockRejectedValueOnce(
      Object.assign(new Error('bad request'), { response: { status: 400 } })
    );

    await tool.handler(args);

    expect(setBuildTypeField).toHaveBeenNthCalledWith(
      1,
      'HoneycombHaven_ApiGatewayBuild',
      'settings/artifactRules',
      'dist/** => legacy.zip'
    );
    expect(setBuildTypeField).toHaveBeenNthCalledWith(
      2,
      'HoneycombHaven_ApiGatewayBuild',
      'artifactRules',
      'dist/** => legacy.zip'
    );
  });
});
