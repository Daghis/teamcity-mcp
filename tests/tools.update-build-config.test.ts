/**
 * Tests for update_build_config tool
 * Verifies artifactRules uses direct HTTP (not the OpenAPI client) and other fields remain unchanged
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

// Mock axios put for artifact rules (bypasses OpenAPI client)
const mockPut = jest.fn(async () => ({ data: 'OK' }));

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
      http: {
        put: mockPut,
        defaults: {
          baseURL: 'https://teamcity.test.local',
          timeout: 30000,
        },
      },
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
    mockPut.mockClear();
    mockPut.mockResolvedValue({ data: 'OK' });
  });

  it('uses direct HTTP PUT for artifact rules update (bypassing OpenAPI client)', async () => {
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

    // Assert name/description/paused still use OpenAPI client
    expect(setBuildTypeField).toHaveBeenCalledWith(
      'HoneycombHaven_ApiGatewayBuild',
      'name',
      'New Name',
      { headers: { 'Content-Type': 'text/plain', Accept: 'text/plain' } }
    );
    expect(setBuildTypeField).toHaveBeenCalledWith(
      'HoneycombHaven_ApiGatewayBuild',
      'description',
      'New description',
      { headers: { 'Content-Type': 'text/plain', Accept: 'text/plain' } }
    );
    expect(setBuildTypeField).toHaveBeenCalledWith(
      'HoneycombHaven_ApiGatewayBuild',
      'paused',
      'true',
      { headers: { 'Content-Type': 'text/plain', Accept: 'text/plain' } }
    );

    // Artifact rules should use direct HTTP PUT with unencoded slashes in path
    expect(mockPut).toHaveBeenCalledWith(
      '/app/rest/buildTypes/HoneycombHaven_ApiGatewayBuild/settings/artifactRules',
      'dist/** => api-gateway-%build.number%.zip',
      { headers: { 'Content-Type': 'text/plain', Accept: 'text/plain' } }
    );

    // setBuildTypeField should NOT be called for artifact rules
    expect(setBuildTypeField).not.toHaveBeenCalledWith(
      expect.anything(),
      'settings/artifactRules',
      expect.anything()
    );
    expect(setBuildTypeField).not.toHaveBeenCalledWith(
      expect.anything(),
      'artifactRules',
      expect.anything()
    );
  });

  it('retries artifact rules update using legacy path when settings/ path fails', async () => {
    const { getRequiredTool } = await import('../src/tools');
    const tool = getRequiredTool('update_build_config') as ToolDefinition;

    const args = {
      buildTypeId: 'HoneycombHaven_ApiGatewayBuild',
      artifactRules: 'dist/** => legacy.zip',
    };

    // First call to settings/artifactRules fails with 400
    mockPut.mockRejectedValueOnce(
      Object.assign(new Error('bad request'), { response: { status: 400 } })
    );

    await tool.handler(args);

    // First attempt: settings/artifactRules
    expect(mockPut).toHaveBeenNthCalledWith(
      1,
      '/app/rest/buildTypes/HoneycombHaven_ApiGatewayBuild/settings/artifactRules',
      'dist/** => legacy.zip',
      { headers: { 'Content-Type': 'text/plain', Accept: 'text/plain' } }
    );

    // Fallback: artifactRules (legacy path)
    expect(mockPut).toHaveBeenNthCalledWith(
      2,
      '/app/rest/buildTypes/HoneycombHaven_ApiGatewayBuild/artifactRules',
      'dist/** => legacy.zip',
      { headers: { 'Content-Type': 'text/plain', Accept: 'text/plain' } }
    );
  });

  it('properly encodes buildTypeId in URL path', async () => {
    const { getRequiredTool } = await import('../src/tools');
    const tool = getRequiredTool('update_build_config') as ToolDefinition;

    // buildTypeId with special characters that need encoding
    const args = {
      buildTypeId: 'Project_Build With Spaces',
      artifactRules: 'output/** => build.zip',
    };

    // Make getBuildType throw to trigger fallback path which uses typedArgs.buildTypeId directly
    getBuildType.mockRejectedValueOnce(new Error('not found'));

    await tool.handler(args);

    // buildTypeId should be URL-encoded, but the settings/artifactRules path should NOT
    expect(mockPut).toHaveBeenCalledWith(
      '/app/rest/buildTypes/Project_Build%20With%20Spaces/settings/artifactRules',
      'output/** => build.zip',
      { headers: { 'Content-Type': 'text/plain', Accept: 'text/plain' } }
    );
  });
});
