import type { Logger } from 'winston';

import {
  BuildConfigManager,
  type ManagedBuildConfiguration,
} from '@/teamcity/build-config-manager';

import {
  createAuthorizationError,
  createAxiosError,
  createNetworkError,
  createServerError,
} from '../../test-utils/errors';
import {
  type MockTeamCityClient,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

describe('BuildConfigManager', () => {
  let manager: BuildConfigManager;
  let mockClient: MockTeamCityClient;
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
    mockClient.resetAllMocks();

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
    mockClient.projects.getAllSubprojectsOrdered.mockResolvedValue({
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
    mockClient.projects.getAllSubprojectsOrdered.mockRejectedValue(new Error('boom'));

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

  describe('default options and fallback branches', () => {
    it('uses default sort and pagination when options are empty', async () => {
      const buildTypes = [
        createBuildType({ id: 'b-cfg', name: 'B Config' }),
        createBuildType({ id: 'a-cfg', name: 'A Config' }),
      ];
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: buildTypes },
      });

      const result = await manager.listConfigurations({});

      // Default sort by name ascending
      expect(result.configurations[0]?.name).toBe('A Config');
      expect(result.configurations[1]?.name).toBe('B Config');
      // Default pagination
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pageSize).toBe(50);
    });

    it('uses defaults when called with no arguments', async () => {
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [createBuildType()] },
      });

      const result = await manager.listConfigurations();

      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pageSize).toBe(50);
      expect(result.configurations).toHaveLength(1);
    });

    it('returns empty array when buildType is undefined in response', async () => {
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: {},
      });

      const result = await manager.listConfigurations();

      expect(result.configurations).toEqual([]);
      expect(result.pagination.totalCount).toBe(0);
    });
  });

  describe('buildLocator branch coverage', () => {
    it('builds locator with projectIds array instead of single projectId', async () => {
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [] },
      });

      await manager.listConfigurations({
        filters: {
          projectIds: ['Proj_A', 'Proj_B', 'Proj_C'],
        },
      });

      expect(mockClient.buildTypes.getAllBuildTypes).toHaveBeenCalledWith(
        'affectedProject:(id:Proj_A,id:Proj_B,id:Proj_C)',
        expect.any(String)
      );
    });

    it('returns undefined locator when no filters provided', async () => {
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [] },
      });

      await manager.listConfigurations({ filters: {} });

      expect(mockClient.buildTypes.getAllBuildTypes).toHaveBeenCalledWith(
        undefined,
        expect.any(String)
      );
    });

    it('ignores empty projectIds array', async () => {
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [] },
      });

      await manager.listConfigurations({
        filters: { projectIds: [] },
      });

      expect(mockClient.buildTypes.getAllBuildTypes).toHaveBeenCalledWith(
        undefined,
        expect.any(String)
      );
    });
  });

  describe('normalizeBuildType null coalescing fallbacks', () => {
    it.each([
      ['id', { id: undefined }, ''],
      ['name', { name: undefined }, ''],
      ['projectId', { projectId: undefined }, ''],
      ['projectName', { projectName: undefined }, ''],
    ] as const)('defaults %s to empty string when undefined', async (field, override, expected) => {
      const buildType = createBuildType(override);
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();
      const config = result.configurations[0];

      expect(config?.[field]).toBe(expected);
    });

    it('defaults paused to false when undefined', async () => {
      const buildType = createBuildType({ paused: undefined });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.paused).toBe(false);
    });

    it('defaults templateFlag to false when undefined', async () => {
      const buildType = createBuildType({ templateFlag: undefined });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.templateFlag).toBe(false);
    });

    it('omits templateId when template is undefined', async () => {
      const buildType = createBuildType({ template: undefined });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.templateId).toBeUndefined();
    });

    it('omits templateId when template.id is undefined', async () => {
      const buildType = createBuildType({ template: {} });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.templateId).toBeUndefined();
    });

    it('omits parameters when parameters property is undefined', async () => {
      const buildType = createBuildType({ parameters: undefined });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.parameters).toBeUndefined();
    });

    it('omits parameters when parameters.property is undefined', async () => {
      const buildType = createBuildType({ parameters: {} });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.parameters).toBeUndefined();
    });

    it('skips parameters with missing name', async () => {
      const buildType = createBuildType({
        parameters: {
          property: [
            { name: 'valid', value: 'v1' },
            { name: undefined, value: 'v2' },
            { name: 'another', value: 'v3' },
          ],
        },
      });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.parameters).toEqual({
        valid: 'v1',
        another: 'v3',
      });
    });

    it('skips parameters with missing value', async () => {
      const buildType = createBuildType({
        parameters: {
          property: [
            { name: 'valid', value: 'v1' },
            { name: 'novalue', value: undefined },
          ],
        },
      });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.parameters).toEqual({ valid: 'v1' });
    });
  });

  describe('VCS root entries branch coverage', () => {
    it('omits vcsRootIds when vcs-root-entries is undefined', async () => {
      const buildType = createBuildType({ ['vcs-root-entries']: undefined });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.vcsRootIds).toBeUndefined();
    });

    it('omits vcsRootIds when vcs-root-entry is undefined', async () => {
      const buildType = createBuildType({
        ['vcs-root-entries']: {},
      });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.vcsRootIds).toBeUndefined();
    });

    it('filters out VCS entries with undefined id', async () => {
      const buildType = createBuildType({
        ['vcs-root-entries']: {
          'vcs-root-entry': [{ id: 'VCS_1' }, { id: undefined }, { id: 'VCS_2' }],
        },
      });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.vcsRootIds).toEqual(['VCS_1', 'VCS_2']);
    });
  });

  describe('steps and triggers count branch coverage', () => {
    it('omits buildSteps when steps is undefined', async () => {
      const buildType = createBuildType({ steps: undefined });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.buildSteps).toBeUndefined();
    });

    it('omits buildSteps when steps.count is undefined', async () => {
      const buildType = createBuildType({ steps: {} });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.buildSteps).toBeUndefined();
    });

    it('omits triggers when triggers object is undefined', async () => {
      const buildType = createBuildType({ triggers: undefined });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.triggers).toBeUndefined();
    });

    it('omits triggers when triggers.count is undefined', async () => {
      const buildType = createBuildType({ triggers: {} });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.triggers).toBeUndefined();
    });
  });

  describe('dependencies branch coverage', () => {
    it('omits dependencies when both snapshot and artifact dependencies undefined', async () => {
      const buildType = createBuildType({
        ['snapshot-dependencies']: undefined,
        ['artifact-dependencies']: undefined,
      });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.dependencies).toBeUndefined();
    });

    it('creates dependencies object when only snapshot-dependencies exists', async () => {
      const buildType = createBuildType({
        ['snapshot-dependencies']: { 'snapshot-dependency': [{ id: 'snap-1' }] },
        ['artifact-dependencies']: undefined,
      });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.dependencies).toEqual({
        snapshot: ['snap-1'],
        artifact: [],
      });
    });

    it('creates dependencies object when only artifact-dependencies exists', async () => {
      const buildType = createBuildType({
        ['snapshot-dependencies']: undefined,
        ['artifact-dependencies']: { 'artifact-dependency': [{ id: 'art-1' }] },
      });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.dependencies).toEqual({
        snapshot: [],
        artifact: ['art-1'],
      });
    });

    it('handles snapshot-dependencies with undefined nested array', async () => {
      const buildType = createBuildType({
        ['snapshot-dependencies']: {},
        ['artifact-dependencies']: { 'artifact-dependency': [{ id: 'art-1' }] },
      });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.dependencies).toEqual({
        snapshot: [],
        artifact: ['art-1'],
      });
    });

    it('handles artifact-dependencies with undefined nested array', async () => {
      const buildType = createBuildType({
        ['snapshot-dependencies']: { 'snapshot-dependency': [{ id: 'snap-1' }] },
        ['artifact-dependencies']: {},
      });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.dependencies).toEqual({
        snapshot: ['snap-1'],
        artifact: [],
      });
    });

    it('filters out dependencies with undefined id', async () => {
      const buildType = createBuildType({
        ['snapshot-dependencies']: {
          'snapshot-dependency': [{ id: 'snap-1' }, { id: undefined }, { id: 'snap-2' }],
        },
        ['artifact-dependencies']: {
          'artifact-dependency': [{ id: undefined }, { id: 'art-1' }],
        },
      });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [buildType] },
      });

      const result = await manager.listConfigurations();

      expect(result.configurations[0]?.dependencies).toEqual({
        snapshot: ['snap-1', 'snap-2'],
        artifact: ['art-1'],
      });
    });
  });

  describe('applyFilters branch coverage', () => {
    it('filters by simple name pattern without wildcards', async () => {
      const buildTypes = [
        createBuildType({ id: 'cfg-1', name: 'API Service Build' }),
        createBuildType({ id: 'cfg-2', name: 'UI Service Build' }),
        createBuildType({ id: 'cfg-3', name: 'Background Worker' }),
      ];
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: buildTypes },
      });

      const result = await manager.listConfigurations({
        filters: { namePattern: 'Service' },
      });

      expect(result.configurations.map((c) => c.id)).toEqual(['cfg-1', 'cfg-2']);
    });

    it('filters by case-insensitive simple pattern', async () => {
      const buildTypes = [
        createBuildType({ id: 'cfg-1', name: 'API Service' }),
        createBuildType({ id: 'cfg-2', name: 'api-client' }),
      ];
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: buildTypes },
      });

      const result = await manager.listConfigurations({
        filters: { namePattern: 'API' },
      });

      expect(result.configurations.map((c) => c.id)).toEqual(['cfg-1', 'cfg-2']);
    });

    it('filters by question mark wildcard pattern', async () => {
      const buildTypes = [
        createBuildType({ id: 'cfg-1', name: 'test-1' }),
        createBuildType({ id: 'cfg-2', name: 'test-2' }),
        createBuildType({ id: 'cfg-3', name: 'test-10' }),
      ];
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: buildTypes },
      });

      const result = await manager.listConfigurations({
        filters: { namePattern: 'test-?' },
      });

      expect(result.configurations.map((c) => c.id)).toEqual(['cfg-1', 'cfg-2']);
    });

    it('handles hasVcsRoot filter with undefined vcsRootIds', async () => {
      const buildTypes = [
        createBuildType({
          id: 'has-vcs',
          ['vcs-root-entries']: { 'vcs-root-entry': [{ id: 'v1' }] },
        }),
        createBuildType({ id: 'no-vcs', ['vcs-root-entries']: undefined }),
      ];
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: buildTypes },
      });

      const result = await manager.listConfigurations({
        filters: { hasVcsRoot: true },
      });

      expect(result.configurations.map((c) => c.id)).toEqual(['has-vcs']);
    });

    it('handles hasVcsRoot=false with configs that have undefined vcsRootIds', async () => {
      const buildTypes = [
        createBuildType({
          id: 'has-vcs',
          ['vcs-root-entries']: { 'vcs-root-entry': [{ id: 'v1' }] },
        }),
        createBuildType({ id: 'no-vcs', ['vcs-root-entries']: undefined }),
      ];
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: buildTypes },
      });

      const result = await manager.listConfigurations({
        filters: { hasVcsRoot: false },
      });

      expect(result.configurations.map((c) => c.id)).toEqual(['no-vcs']);
    });

    it('handles hasTriggers filter with undefined triggers', async () => {
      const buildTypes = [
        createBuildType({ id: 'has-triggers', triggers: { count: 2 } }),
        createBuildType({ id: 'no-triggers', triggers: undefined }),
      ];
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: buildTypes },
      });

      const result = await manager.listConfigurations({
        filters: { hasTriggers: true },
      });

      expect(result.configurations.map((c) => c.id)).toEqual(['has-triggers']);
    });

    it('handles hasTriggers=false with triggers=0', async () => {
      const buildTypes = [
        createBuildType({ id: 'has-triggers', triggers: { count: 1 } }),
        createBuildType({ id: 'zero-triggers', triggers: { count: 0 } }),
        createBuildType({ id: 'no-triggers', triggers: undefined }),
      ];
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: buildTypes },
      });

      const result = await manager.listConfigurations({
        filters: { hasTriggers: false },
      });

      expect(result.configurations.map((c) => c.id)).toEqual(['zero-triggers', 'no-triggers']);
    });
  });

  describe('sortConfigurations branch coverage', () => {
    it('sorts by id ascending', async () => {
      const buildTypes = [
        createBuildType({ id: 'z-config', name: 'Alpha' }),
        createBuildType({ id: 'a-config', name: 'Zulu' }),
        createBuildType({ id: 'm-config', name: 'Mike' }),
      ];
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: buildTypes },
      });

      const result = await manager.listConfigurations({
        sort: { by: 'id', order: 'asc' },
      });

      expect(result.configurations.map((c) => c.id)).toEqual(['a-config', 'm-config', 'z-config']);
    });

    it('sorts by id descending', async () => {
      const buildTypes = [
        createBuildType({ id: 'z-config', name: 'Alpha' }),
        createBuildType({ id: 'a-config', name: 'Zulu' }),
      ];
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: buildTypes },
      });

      const result = await manager.listConfigurations({
        sort: { by: 'id', order: 'desc' },
      });

      expect(result.configurations.map((c) => c.id)).toEqual(['z-config', 'a-config']);
    });

    it('uses default comparison (0) for unsupported sort fields', async () => {
      const buildTypes = [
        createBuildType({ id: 'cfg-1', name: 'Beta' }),
        createBuildType({ id: 'cfg-2', name: 'Alpha' }),
      ];
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: buildTypes },
      });

      // 'created' is defined in the type but not implemented in switch
      const result = await manager.listConfigurations({
        sort: { by: 'created', order: 'asc' },
      });

      // Order preserved as-is since comparison returns 0
      expect(result.configurations.map((c) => c.id)).toEqual(['cfg-1', 'cfg-2']);
    });

    it('sorts by projectName descending', async () => {
      const buildTypes = [
        createBuildType({ id: 'cfg-1', projectName: 'Alpha Project' }),
        createBuildType({ id: 'cfg-2', projectName: 'Zulu Project' }),
      ];
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: buildTypes },
      });

      const result = await manager.listConfigurations({
        sort: { by: 'projectName', order: 'desc' },
      });

      expect(result.configurations.map((c) => c.id)).toEqual(['cfg-2', 'cfg-1']);
    });

    it('uses default ascending order when order is undefined', async () => {
      const buildTypes = [
        createBuildType({ id: 'cfg-1', name: 'Zulu' }),
        createBuildType({ id: 'cfg-2', name: 'Alpha' }),
      ];
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: buildTypes },
      });

      const result = await manager.listConfigurations({
        sort: { by: 'name' }, // order undefined, should default to 'asc'
      });

      expect(result.configurations.map((c) => c.name)).toEqual(['Alpha', 'Zulu']);
    });

    it('uses default sort by name when by is undefined', async () => {
      const buildTypes = [
        createBuildType({ id: 'cfg-1', name: 'Zulu Config' }),
        createBuildType({ id: 'cfg-2', name: 'Alpha Config' }),
      ];
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: buildTypes },
      });

      const result = await manager.listConfigurations({
        sort: { order: 'asc' }, // by undefined, should default to 'name'
      });

      expect(result.configurations.map((c) => c.name)).toEqual(['Alpha Config', 'Zulu Config']);
    });

    it('uses both defaults when sort is empty object', async () => {
      const buildTypes = [
        createBuildType({ id: 'cfg-1', name: 'Zulu' }),
        createBuildType({ id: 'cfg-2', name: 'Alpha' }),
      ];
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: buildTypes },
      });

      const result = await manager.listConfigurations({
        sort: {}, // both by and order undefined
      });

      expect(result.configurations.map((c) => c.name)).toEqual(['Alpha', 'Zulu']);
    });
  });

  describe('pagination branch coverage', () => {
    it('calculates hasNext and hasPrevious correctly', async () => {
      const buildTypes = Array.from({ length: 25 }, (_, i) =>
        createBuildType({ id: `cfg-${i}`, name: `Config ${i}` })
      );
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: buildTypes },
      });

      const page2 = await manager.listConfigurations({
        pagination: { page: 2, pageSize: 10 },
      });

      expect(page2.pagination.hasNext).toBe(true);
      expect(page2.pagination.hasPrevious).toBe(true);
      expect(page2.pagination.totalPages).toBe(3);
    });

    it('handles last page correctly', async () => {
      const buildTypes = Array.from({ length: 25 }, (_, i) =>
        createBuildType({ id: `cfg-${i}`, name: `Config ${i}` })
      );
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: buildTypes },
      });

      const lastPage = await manager.listConfigurations({
        pagination: { page: 3, pageSize: 10 },
      });

      expect(lastPage.pagination.hasNext).toBe(false);
      expect(lastPage.pagination.hasPrevious).toBe(true);
      expect(lastPage.configurations).toHaveLength(5);
    });

    it('uses default pagination values', async () => {
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [createBuildType()] },
      });

      const result = await manager.listConfigurations({
        pagination: {},
      });

      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pageSize).toBe(50);
    });
  });

  describe('getSubprojectIds branch coverage', () => {
    it('handles undefined project array in response', async () => {
      mockClient.projects.getAllSubprojectsOrdered.mockResolvedValue({
        data: {},
      });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [] },
      });

      const configs = await manager.getProjectConfigurations('Proj_Main', true);

      expect(configs).toEqual([]);
    });

    it('filters out projects with undefined id', async () => {
      mockClient.projects.getAllSubprojectsOrdered.mockResolvedValue({
        data: { project: [{ id: 'Sub_1' }, { id: undefined }, { id: 'Sub_2' }] },
      });
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [] },
      });

      await manager.getProjectConfigurations('Proj_Main', true);

      expect(mockClient.buildTypes.getAllBuildTypes).toHaveBeenCalledWith(
        'affectedProject:(id:Proj_Main,id:Sub_1,id:Sub_2)',
        expect.any(String)
      );
    });
  });

  describe('getProjectConfigurations branch coverage', () => {
    it('fetches without subprojects by default', async () => {
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [createBuildType()] },
      });

      await manager.getProjectConfigurations('Proj_Main');

      expect(mockClient.projects.getAllSubprojectsOrdered).not.toHaveBeenCalled();
      expect(mockClient.buildTypes.getAllBuildTypes).toHaveBeenCalledWith(
        'affectedProject:(id:Proj_Main)',
        expect.any(String)
      );
    });

    it('fetches with includeSubprojects=false', async () => {
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [] },
      });

      await manager.getProjectConfigurations('Proj_Main', false);

      expect(mockClient.projects.getAllSubprojectsOrdered).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('logs and rethrows error from listConfigurations', async () => {
      const error = createServerError('Internal server error');
      mockClient.buildTypes.getAllBuildTypes.mockRejectedValue(error);

      await expect(manager.listConfigurations()).rejects.toThrow();
      expect(logger.error).toHaveBeenCalledWith('Failed to list build configurations', {
        error,
        options: {},
      });
    });

    it('handles 403 Forbidden error from listConfigurations', async () => {
      const error = createAuthorizationError();
      mockClient.buildTypes.getAllBuildTypes.mockRejectedValue(error);

      await expect(
        manager.listConfigurations({ filters: { projectId: 'restricted' } })
      ).rejects.toThrow();
      expect(logger.error).toHaveBeenCalledWith('Failed to list build configurations', {
        error,
        options: { filters: { projectId: 'restricted' } },
      });
    });

    it('handles network error from listConfigurations', async () => {
      const error = createNetworkError('ECONNREFUSED');
      mockClient.buildTypes.getAllBuildTypes.mockRejectedValue(error);

      await expect(manager.listConfigurations()).rejects.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });

    it('logs and rethrows error from getProjectConfigurations', async () => {
      const error = createAxiosError({ status: 500 });
      mockClient.buildTypes.getAllBuildTypes.mockRejectedValue(error);

      await expect(manager.getProjectConfigurations('Proj_Main')).rejects.toThrow();
      expect(logger.error).toHaveBeenCalledWith('Failed to get project configurations', {
        error,
        projectId: 'Proj_Main',
        includeSubprojects: false,
      });
    });

    it('logs and rethrows error from getProjectConfigurations with subprojects', async () => {
      mockClient.projects.getAllSubprojectsOrdered.mockResolvedValue({
        data: { project: [{ id: 'Sub_1' }] },
      });
      const error = createAxiosError({ status: 502, message: 'Bad gateway' });
      mockClient.buildTypes.getAllBuildTypes.mockRejectedValue(error);

      await expect(manager.getProjectConfigurations('Proj_Main', true)).rejects.toThrow();
      expect(logger.error).toHaveBeenCalledWith('Failed to get project configurations', {
        error,
        projectId: 'Proj_Main',
        includeSubprojects: true,
      });
    });

    it('logs and rethrows error from getTemplateHierarchy', async () => {
      const error = createAxiosError({ status: 404, message: 'Template not found' });
      mockClient.buildTypes.getBuildType.mockRejectedValue(error);

      await expect(manager.getTemplateHierarchy('NonExistent_Template')).rejects.toThrow();
      expect(logger.error).toHaveBeenCalledWith('Failed to get template hierarchy', {
        error,
        templateId: 'NonExistent_Template',
      });
    });
  });

  describe('buildFieldsSpec branch coverage', () => {
    it('includes detail fields when includeDetails is true', async () => {
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [] },
      });

      await manager.listConfigurations({ includeDetails: true });

      const fieldsArg = mockClient.buildTypes.getAllBuildTypes.mock.calls[0]?.[1] as string;
      expect(fieldsArg).toContain('parameters');
      expect(fieldsArg).toContain('vcs-root-entries');
      expect(fieldsArg).toContain('steps(count)');
      expect(fieldsArg).toContain('triggers(count)');
      expect(fieldsArg).toContain('snapshot-dependencies');
      expect(fieldsArg).toContain('artifact-dependencies');
    });

    it('excludes detail fields when includeDetails is false', async () => {
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [] },
      });

      await manager.listConfigurations({ includeDetails: false });

      const fieldsArg = mockClient.buildTypes.getAllBuildTypes.mock.calls[0]?.[1] as string;
      expect(fieldsArg).not.toContain('parameters(property');
      expect(fieldsArg).not.toContain('vcs-root-entries');
      expect(fieldsArg).not.toContain('steps(count)');
    });

    it('excludes detail fields when includeDetails is undefined', async () => {
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
        data: { buildType: [] },
      });

      await manager.listConfigurations({});

      const fieldsArg = mockClient.buildTypes.getAllBuildTypes.mock.calls[0]?.[1] as string;
      expect(fieldsArg).not.toContain('steps(count)');
    });
  });
});
