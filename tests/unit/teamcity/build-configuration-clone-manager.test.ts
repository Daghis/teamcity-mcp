import { BuildConfigurationCloneManager } from '@/teamcity/build-configuration-clone-manager';
import type { TeamCityUnifiedClient } from '@/teamcity/types/client';

jest.mock('@/config', () => ({
  getTeamCityUrl: jest.fn(() => 'https://teamcity.example'),
}));

jest.mock('@/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

type ClientMocks = {
  modules: {
    buildTypes: {
      getBuildType: jest.Mock;
      createBuildType: jest.Mock;
    };
    projects: {
      getProject: jest.Mock;
    };
    vcsRoots: {
      getAllVcsRoots: jest.Mock;
      addVcsRoot: jest.Mock;
    };
  };
};

function createClientMock(): ClientMocks {
  return {
    modules: {
      buildTypes: {
        getBuildType: jest.fn(),
        createBuildType: jest.fn(),
      },
      projects: {
        getProject: jest.fn(),
      },
      vcsRoots: {
        getAllVcsRoots: jest.fn(),
        addVcsRoot: jest.fn(),
      },
    },
  };
}

function createManager(client: ClientMocks): BuildConfigurationCloneManager {
  return new BuildConfigurationCloneManager(client as unknown as TeamCityUnifiedClient);
}

describe('BuildConfigurationCloneManager', () => {
  let client: ClientMocks;
  let manager: BuildConfigurationCloneManager;

  beforeEach(() => {
    client = createClientMock();
    manager = createManager(client);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('retrieveConfiguration', () => {
    it('returns full configuration when source exists', async () => {
      const response = {
        data: {
          id: 'SourceCfg',
          name: 'Source Config',
          projectId: 'Project1',
          description: 'Source description',
          steps: { step: [{ id: 'RUNNER_1', type: 'simpleRunner' }] },
          triggers: { trigger: [{ id: 'TRIGGER_1', type: 'vcsTrigger' }] },
          features: { feature: [{ id: 'FEATURE_1', type: 'swabra' }] },
          templates: { buildType: [{ id: 'Template1' }] },
          settings: {
            property: [
              { name: 'buildNumberCounter', value: '5' },
              { name: 'buildNumberPattern', value: '1.{build.counter}' },
            ],
          },
          parameters: {
            property: [
              { name: 'env.FOO', value: 'bar' },
              { name: 'env.BAR', value: 'baz' },
            ],
          },
          'artifact-dependencies': {
            'artifact-dependency': [
              { sourceBuildTypeId: 'SourceCfg', name: 'artifact' },
            ],
          },
          'snapshot-dependencies': {
            'snapshot-dependency': [
              { dependsOnBuildTypeId: 'SourceCfg', type: { name: 'snapshot' } },
            ],
          },
          'vcs-root-entries': {
            'vcs-root-entry': [
              {
                'vcs-root': { id: 'Root1' },
              },
            ],
          },
        },
      };
      client.modules.buildTypes.getBuildType.mockResolvedValue(response);

      const result = await manager.retrieveConfiguration('SourceCfg');
      expect(result).not.toBeNull();
      expect(result?.vcsRootId).toBe('Root1');
      expect(result?.parameters).toEqual({ 'env.FOO': 'bar', 'env.BAR': 'baz' });
      expect(result?.buildNumberCounter).toBe(5);
      expect(result?.buildNumberFormat).toBe('1.{build.counter}');
    });

    it('returns null when configuration is missing', async () => {
      client.modules.buildTypes.getBuildType.mockResolvedValue({ data: null });

      const result = await manager.retrieveConfiguration('MissingCfg');
      expect(result).toBeNull();
    });

    it('returns null on 404 responses', async () => {
      client.modules.buildTypes.getBuildType.mockRejectedValue({ response: { status: 404 } });

      const result = await manager.retrieveConfiguration('MissingCfg');
      expect(result).toBeNull();
    });

    it('throws a permission error on 403 responses', async () => {
      client.modules.buildTypes.getBuildType.mockRejectedValue({ response: { status: 403 } });

      await expect(manager.retrieveConfiguration('ProtectedCfg')).rejects.toThrow(
        'Permission denied'
      );
    });
  });

  describe('validateTargetProject', () => {
    it('returns project details when accessible', async () => {
      client.modules.projects.getProject.mockResolvedValue({ data: { id: 'Proj', name: 'Name' } });

      const result = await manager.validateTargetProject('Proj');
      expect(result).toEqual({ id: 'Proj', name: 'Name' });
    });

    it('returns null when project is missing', async () => {
      client.modules.projects.getProject.mockResolvedValue({ data: { id: undefined } });

      const result = await manager.validateTargetProject('Proj');
      expect(result).toBeNull();
    });

    it('returns null on 404 and 403 errors', async () => {
      client.modules.projects.getProject.mockRejectedValueOnce({ response: { status: 404 } });
      const notFound = await manager.validateTargetProject('Missing');
      expect(notFound).toBeNull();

      client.modules.projects.getProject.mockRejectedValueOnce({ response: { status: 403 } });
      const forbidden = await manager.validateTargetProject('Forbidden');
      expect(forbidden).toBeNull();
    });
  });

  describe('handleVcsRoot', () => {
    it('reuses existing VCS root when requested', async () => {
      const result = await manager.handleVcsRoot('Root1', 'reuse', 'Proj');
      expect(result).toEqual({ id: 'Root1', name: 'Reused VCS Root' });
    });

    it('clones VCS root when handling is clone', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1700);
      client.modules.vcsRoots.getAllVcsRoots.mockResolvedValue({
        data: {
          'vcs-root': [
            {
              name: 'MainRoot',
              vcsName: 'jetbrains.git',
              properties: { property: [] },
            },
          ],
        },
      });
      client.modules.vcsRoots.addVcsRoot.mockResolvedValue({
        data: { id: 'RootClone', name: 'MainRoot_Clone_1700' },
      });

      const result = await manager.handleVcsRoot('Root1', 'clone', 'Proj');
      expect(result).toEqual({ id: 'RootClone', name: 'MainRoot_Clone_1700' });
    });
  });

  describe('applyParameterOverrides', () => {
    it('merges overrides respecting validation', async () => {
      const merged = await manager.applyParameterOverrides({ env: 'old' }, { 'env.NEW': 'value' });
      expect(merged).toEqual({ env: 'old', 'env.NEW': 'value' });
    });

    it('throws when parameter name is invalid', async () => {
      await expect(
        manager.applyParameterOverrides({}, { 'invalid name': 'value' })
      ).rejects.toThrow('Invalid parameter name');
    });
  });

  describe('cloneConfiguration', () => {
    it('creates cloned configuration with derived payload', async () => {
      client.modules.buildTypes.createBuildType.mockResolvedValue({
        data: { id: 'Proj_Config', name: 'Cloned', projectId: 'Proj', description: 'Clone' },
      });

      const source = {
        id: 'Source',
        name: 'Source Config',
        projectId: 'SrcProj',
        templateId: 'Template1',
        steps: [{ id: 'RUNNER_1', type: 'simpleRunner' }],
        triggers: [{ id: 'TRIGGER_1', type: 'vcsTrigger' }],
        features: [{ id: 'FEATURE_1', type: 'feature' }],
        artifactDependencies: [{ sourceBuildTypeId: 'Source' }],
        snapshotDependencies: [{ dependsOnBuildTypeId: 'Source' }],
        parameters: { 'env.OLD': 'value' },
        buildNumberCounter: 7,
        buildNumberFormat: '1.{build.counter}',
        vcsRootId: 'Root1',
      };

      const result = await manager.cloneConfiguration(source, {
        name: 'Config',
        targetProjectId: 'Proj',
        description: 'Clone',
        vcsRootId: 'Root2',
        parameters: { 'env.NEW': 'value' },
        copyBuildCounter: true,
      });

      expect(client.modules.buildTypes.createBuildType).toHaveBeenCalled();
      expect(result).toEqual({
        id: 'Proj_Config',
        name: 'Cloned',
        projectId: 'Proj',
        description: 'Clone',
        vcsRootId: 'Root2',
        parameters: { 'env.NEW': 'value' },
        url: 'https://teamcity.example/viewType.html?buildTypeId=Proj_Config',
      });
    });

    it('maps known error responses to friendly messages', async () => {
      client.modules.buildTypes.createBuildType.mockRejectedValueOnce({
        response: { status: 409 },
      });

      await expect(
        manager.cloneConfiguration(
          { id: 'Source', name: 'Src', projectId: 'Proj' },
          { name: 'Cfg', targetProjectId: 'Proj' }
        )
      ).rejects.toThrow('already exists');

      client.modules.buildTypes.createBuildType.mockRejectedValueOnce({
        response: { status: 403 },
      });
      await expect(
        manager.cloneConfiguration(
          { id: 'Source', name: 'Src', projectId: 'Proj' },
          { name: 'Cfg', targetProjectId: 'Proj' }
        )
      ).rejects.toThrow('Permission denied');

      client.modules.buildTypes.createBuildType.mockRejectedValueOnce({
        response: { status: 400, data: { message: 'Invalid payload' } },
      });
      await expect(
        manager.cloneConfiguration(
          { id: 'Source', name: 'Src', projectId: 'Proj' },
          { name: 'Cfg', targetProjectId: 'Proj' }
        )
      ).rejects.toThrow('Invalid configuration: Invalid payload');
    });
  });

  describe('internal helpers', () => {
    it('prepareBuildTypePayload validates required fields', () => {
      const internals = manager as unknown as {
        prepareBuildTypePayload: (payload: unknown) => unknown;
        generateBuildConfigId: (projectId: string, name: string) => string;
        isValidParameterName: (name: string) => boolean;
      };

      const payload = {
        id: 'Cfg',
        name: 'Config',
        project: { id: 'Proj' },
      };

      const result = internals.prepareBuildTypePayload(payload);
      expect(result).toEqual(payload);

      const invalid = { project: {} };
      expect(() => internals.prepareBuildTypePayload(invalid)).toThrow(
        'Invalid build configuration payload'
      );
    });

    it('generateBuildConfigId and parameter name validation behave as expected', () => {
      const internals = manager as unknown as {
        generateBuildConfigId: (projectId: string, name: string) => string;
        isValidParameterName: (name: string) => boolean;
      };

      const generated = internals.generateBuildConfigId('Proj', 'My Config Name');
      expect(generated).toBe('Proj_My_Config_Name');

      const isValid = internals.isValidParameterName('env.VALID_1');
      expect(isValid).toBe(true);
      const isInvalid = internals.isValidParameterName('invalid name');
      expect(isInvalid).toBe(false);
    });
  });
});
