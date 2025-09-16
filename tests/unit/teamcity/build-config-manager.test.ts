import type { Logger } from 'winston';

import {
  BuildConfigManager,
  type ManagedBuildConfiguration,
} from '@/teamcity/build-config-manager';

import { createMockTeamCityClient } from '../../test-utils/mock-teamcity-client';

describe('BuildConfigManager', () => {
  let manager: BuildConfigManager;
  let mockClient: ReturnType<typeof createMockTeamCityClient>;
  let logger: Logger;

  const createBuildType = (overrides: Record<string, unknown> = {}) => ({
    id: 'cfg-id',
    name: 'API Build',
    projectId: 'Proj_Main',
    projectName: 'Main Project',
    description: 'Builds the API',
    webUrl: 'https://example.com',
    paused: false,
    templateFlag: false,
    template: { id: 'Template_1' },
    parameters: {
      property: [
        { name: 'env', value: 'dev' },
        { name: 'branch', value: 'main' },
      ],
    },
    ['vcs-root-entries']: {
      'vcs-root-entry': [{ id: 'VCS_MAIN' }],
    },
    steps: { count: 2 },
    triggers: { count: 1 },
    ['snapshot-dependencies']: {
      'snapshot-dependency': [{ id: 'snap-1' }],
    },
    ['artifact-dependencies']: {
      'artifact-dependency': [{ id: 'artifact-1' }],
    },
    ...overrides,
  });

  beforeEach(() => {
    mockClient = createMockTeamCityClient();
    mockClient.clearAllMocks();

    logger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
      add: jest.fn(),
      remove: jest.fn(),
      child: jest.fn(() => logger),
      close: jest.fn(),
      clear: jest.fn(),
      configure: jest.fn(),
      level: 'info',
      levels: {},
      format: undefined as never,
      transports: [],
      profile: jest.fn(),
      startTimer: jest.fn(),
      query: jest.fn(),
    } as unknown as Logger;

    manager = new BuildConfigManager(mockClient, logger);
  });

  it('lists configurations with filtering, sorting, and pagination', async () => {
    const buildTypes = [
      createBuildType(),
      createBuildType({
        id: 'cfg-2',
        name: 'UI Build',
        projectId: 'Proj_Main',
        triggers: { count: 0 },
      }),
      createBuildType({
        id: 'child-1',
        name: 'Child API',
        projectId: 'Proj_Child',
        ['vcs-root-entries']: { 'vcs-root-entry': [] },
      }),
    ];

    mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({ data: { buildType: buildTypes } });

    const result = await manager.listConfigurations({
      filters: {
        projectId: 'Proj_Main',
        templateFlag: false,
        paused: false,
        tags: ['release', 'hotfix'],
        namePattern: 'API*',
        hasVcsRoot: true,
        hasTriggers: true,
      },
      sort: { by: 'projectName', order: 'desc' },
      pagination: { page: 1, pageSize: 1 },
      includeDetails: true,
    });

    expect(mockClient.buildTypes.getAllBuildTypes).toHaveBeenCalledWith(
      'affectedProject:(id:Proj_Main),templateFlag:false,paused:false,tag:(release,hotfix)',
      expect.stringContaining('parameters')
    );

    expect(result.configurations).toHaveLength(1);
    const config = result.configurations[0];
    expect(config).toBeDefined();
    if (!config) {
      throw new Error('expected configuration result');
    }
    expect(config.id).toBe('cfg-id');
    expect(config.parameters?.['env']).toBe('dev');
    expect(config.dependencies?.snapshot).toEqual(['snap-1']);
    expect(result.pagination.hasNext).toBe(false);
    expect(result.pagination.totalCount).toBe(1);
  });

  it('supports wildcard patterns and negative filters', async () => {
    const buildTypes = [
      createBuildType({
        name: 'agent-service',
        triggers: { count: 1 },
        ['vcs-root-entries']: { 'vcs-root-entry': [{ id: 'vcs-1' }] },
      }),
      createBuildType({
        id: 'cfg-no-vcs',
        name: 'agent-helper',
        ['vcs-root-entries']: { 'vcs-root-entry': [] },
        triggers: { count: 0 },
      }),
    ];

    mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({ data: { buildType: buildTypes } });

    const result = await manager.listConfigurations({
      filters: {
        projectId: 'Proj_Main',
        namePattern: 'agent-*',
        hasVcsRoot: false,
        hasTriggers: false,
      },
      sort: { by: 'name', order: 'asc' },
      pagination: { page: 1, pageSize: 5 },
    });

    expect(result.configurations).toHaveLength(1);
    const config = result.configurations[0];
    expect(config).toBeDefined();
    if (!config) {
      throw new Error('expected configuration result');
    }
    expect(config.id).toBe('cfg-no-vcs');
    expect(result.pagination.hasNext).toBe(false);
    expect(result.pagination.totalPages).toBe(1);
  });

  it('fetches project configurations including subprojects', async () => {
    (mockClient.projects.getAllSubprojectsOrdered as jest.Mock).mockResolvedValue({
      data: { project: [{ id: 'Sub_1' }, { id: 'Sub_2' }] },
    });
    mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
      data: { buildType: [createBuildType({ projectId: 'Sub_1' })] },
    });

    const configs = await manager.getProjectConfigurations('Proj_Main', true);

    expect(mockClient.buildTypes.getAllBuildTypes).toHaveBeenCalledWith(
      'affectedProject:(id:Proj_Main,id:Sub_1,id:Sub_2)',
      expect.any(String)
    );
    expect(configs).toHaveLength(1);
  });

  it('returns empty subproject list on API errors', async () => {
    (mockClient.projects.getAllSubprojectsOrdered as jest.Mock).mockRejectedValue(
      new Error('boom')
    );

    const ids = await (
      manager as unknown as {
        getSubprojectIds(projectId: string): Promise<string[]>;
      }
    ).getSubprojectIds('root');

    expect(ids).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith('Failed to get subprojects', {
      error: expect.any(Error),
      projectId: 'root',
    });
  });

  it('builds template hierarchy including inheritors', async () => {
    mockClient.buildTypes.getBuildType.mockResolvedValue({
      data: createBuildType({ id: 'Template_1', templateFlag: true }),
    });

    const listSpy = jest.spyOn(manager, 'listConfigurations').mockResolvedValue({
      configurations: [
        {
          id: 'child-uses-template',
          name: 'Child API',
          projectId: 'Proj_Main',
          projectName: 'Main Project',
          description: 'child build',
          webUrl: 'https://example.com',
          paused: false,
          templateFlag: false,
          templateId: 'Template_1',
        },
        {
          id: 'other',
          name: 'Another',
          projectId: 'Proj_Main',
          projectName: 'Main Project',
          description: 'another build',
          webUrl: 'https://example.com',
          paused: false,
          templateFlag: false,
          templateId: 'Template_X',
        },
      ] as ManagedBuildConfiguration[],
      pagination: {
        page: 1,
        pageSize: 50,
        totalCount: 2,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    });

    const result = await manager.getTemplateHierarchy('Template_1');

    expect(mockClient.buildTypes.getBuildType).toHaveBeenCalledWith(
      'Template_1',
      expect.any(String)
    );
    expect(result.template.id).toBe('Template_1');
    expect(result.inheritors.map((cfg) => cfg.id)).toEqual(['child-uses-template']);
    listSpy.mockRestore();
  });
});
