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

describe('tools: list_build_artifacts', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('lists top-level artifacts including directories', async () => {
    const listArtifacts = jest.fn().mockResolvedValue([
      {
        name: 'okd',
        path: 'okd',
        size: 0,
        isDirectory: true,
        downloadUrl: '',
        modificationTime: '',
      },
      {
        name: 'readme.txt',
        path: 'readme.txt',
        size: 512,
        isDirectory: false,
        downloadUrl: '',
        modificationTime: '',
      },
    ]);

    const ArtifactManager = jest.fn().mockImplementation(() => ({ listArtifacts }));
    const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
    const getInstance = jest.fn().mockReturnValue({});

    jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
    jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
    jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

    let handler: ToolHandler | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getRequiredTool } = require('@/tools');
      handler = getRequiredTool('list_build_artifacts').handler;
    });

    if (!handler) throw new Error('list_build_artifacts handler not found');

    const response = await handler({ buildId: '123' });
    const payload = JSON.parse(response.content?.[0]?.text ?? '{}');

    expect(payload.artifacts).toHaveLength(2);
    expect(payload.artifacts[0].name).toBe('okd');
    expect(payload.artifacts[0].isDirectory).toBe(true);
    expect(payload.artifacts[1].name).toBe('readme.txt');
    expect(listArtifacts).toHaveBeenCalledWith(
      'id:123',
      expect.objectContaining({
        includeDirectories: true,
      })
    );
  });

  it('passes path option for subdirectory browsing', async () => {
    const listArtifacts = jest.fn().mockResolvedValue([
      {
        name: 'deploy.yaml',
        path: 'okd/deploy.yaml',
        size: 2048,
        isDirectory: false,
        downloadUrl: '',
        modificationTime: '',
      },
    ]);

    const ArtifactManager = jest.fn().mockImplementation(() => ({ listArtifacts }));
    const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
    const getInstance = jest.fn().mockReturnValue({});

    jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
    jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
    jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

    let handler: ToolHandler | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getRequiredTool } = require('@/tools');
      handler = getRequiredTool('list_build_artifacts').handler;
    });

    if (!handler) throw new Error('list_build_artifacts handler not found');

    const response = await handler({ buildId: '456', path: 'okd' });
    const payload = JSON.parse(response.content?.[0]?.text ?? '{}');

    expect(payload.artifacts).toHaveLength(1);
    expect(payload.artifacts[0].name).toBe('deploy.yaml');
    expect(listArtifacts).toHaveBeenCalledWith(
      'id:456',
      expect.objectContaining({
        path: 'okd',
        includeDirectories: true,
      })
    );
  });

  it('passes filter options through to the manager', async () => {
    const listArtifacts = jest.fn().mockResolvedValue([]);

    const ArtifactManager = jest.fn().mockImplementation(() => ({ listArtifacts }));
    const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
    const getInstance = jest.fn().mockReturnValue({});

    jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
    jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
    jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

    let handler: ToolHandler | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getRequiredTool } = require('@/tools');
      handler = getRequiredTool('list_build_artifacts').handler;
    });

    if (!handler) throw new Error('list_build_artifacts handler not found');

    await handler({
      buildId: '789',
      path: 'okd',
      includeNested: true,
      nameFilter: '*.yaml',
      extension: 'yaml',
    });

    expect(listArtifacts).toHaveBeenCalledWith('id:789', {
      path: 'okd',
      includeNested: true,
      includeDirectories: true,
      nameFilter: '*.yaml',
      pathFilter: undefined,
      extension: 'yaml',
    });
  });

  it('supports build identification by buildNumber + buildTypeId', async () => {
    const listArtifacts = jest.fn().mockResolvedValue([]);

    const ArtifactManager = jest.fn().mockImplementation(() => ({ listArtifacts }));
    const createAdapterFromTeamCityAPI = jest.fn().mockReturnValue({});
    const getInstance = jest.fn().mockReturnValue({});

    jest.doMock('@/teamcity/artifact-manager', () => ({ ArtifactManager }));
    jest.doMock('@/teamcity/client-adapter', () => ({ createAdapterFromTeamCityAPI }));
    jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance } }));

    let handler: ToolHandler | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getRequiredTool } = require('@/tools');
      handler = getRequiredTool('list_build_artifacts').handler;
    });

    if (!handler) throw new Error('list_build_artifacts handler not found');

    await handler({
      buildTypeId: 'MyBuild',
      buildNumber: '42',
    });

    expect(listArtifacts).toHaveBeenCalledWith(
      'buildType:(id:MyBuild),number:42',
      expect.objectContaining({ includeDirectories: true })
    );
  });
});
