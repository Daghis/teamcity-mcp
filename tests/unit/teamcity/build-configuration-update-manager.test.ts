import {
  type BuildConfiguration,
  BuildConfigurationUpdateManager,
} from '@/teamcity/build-configuration-update-manager';

import {
  type MockTeamCityClient,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

describe('BuildConfigurationUpdateManager', () => {
  let manager: BuildConfigurationUpdateManager;
  let mockClient: MockTeamCityClient;

  const baseConfig: BuildConfiguration = {
    id: 'cfg1',
    name: 'Sample Config',
    description: 'Original description',
    projectId: 'Proj_Main',
    buildNumberFormat: '%build.counter%',
    artifactRules: 'dist => dist',
    parameters: {
      env: 'dev',
      token: '123',
    },
    agentRequirements: {
      requirement: [],
    },
    buildOptions: {
      cleanBuild: false,
      executionTimeout: 30,
      checkoutDirectory: '.teamcity',
    },
    settings: {
      property: [],
    },
  };

  const createManager = () => new BuildConfigurationUpdateManager(mockClient);

  beforeEach(() => {
    mockClient = createMockTeamCityClient();
    mockClient.resetAllMocks();
    mockClient.buildTypes.setBuildTypeField.mockResolvedValue(undefined);
    mockClient.buildTypes.deleteBuildParameterOfBuildType_2.mockResolvedValue(undefined);
    // Mock http.put for artifact rules (uses direct HTTP instead of OpenAPI client)
    (mockClient.http.put as jest.Mock).mockResolvedValue({ data: 'OK' });

    manager = createManager();
  });

  describe('retrieveConfiguration', () => {
    it('normalizes configuration data', async () => {
      mockClient.buildTypes.getBuildType.mockResolvedValue({
        data: {
          id: 'cfg1',
          name: 'Sample Config',
          description: 'Original description',
          projectId: 'Proj_Main',
          parameters: {
            property: [
              { name: 'env', value: 'dev' },
              { name: 'token', value: '123' },
            ],
          },
          settings: {
            property: [
              { name: 'buildNumberPattern', value: '%build.counter%' },
              { name: 'artifactRules', value: 'dist => dist' },
              { name: 'cleanBuild', value: 'true' },
              { name: 'executionTimeoutMin', value: '20' },
              { name: 'checkoutDirectory', value: '.teamcity' },
            ],
          },
          ['agent-requirements']: { requirement: [] },
        },
      });

      const result = await manager.retrieveConfiguration('cfg1');

      expect(result).toMatchObject({
        id: 'cfg1',
        parameters: { env: 'dev', token: '123' },
        buildOptions: {
          cleanBuild: true,
          executionTimeout: 20,
          checkoutDirectory: '.teamcity',
        },
      });
    });

    it('returns null for missing configuration', async () => {
      const error = Object.assign(new Error('not found'), {
        response: { status: 404 },
      });
      mockClient.buildTypes.getBuildType.mockRejectedValue(error);

      const result = await manager.retrieveConfiguration('cfg-missing');
      expect(result).toBeNull();
    });

    it('throws explicit error on permission failure', async () => {
      const error = Object.assign(new Error('denied'), {
        response: { status: 403 },
      });
      mockClient.buildTypes.getBuildType.mockRejectedValue(error);

      await expect(manager.retrieveConfiguration('cfg1')).rejects.toThrow(
        'Permission denied: No access to build configuration'
      );
    });
  });

  describe('validateUpdates', () => {
    it('throws on invalid parameter names and conflicts', async () => {
      await expect(
        manager.validateUpdates(baseConfig, {
          parameters: { 'invalid name': 'value' },
        })
      ).rejects.toThrow('Invalid parameter name: invalid name');

      await expect(
        manager.validateUpdates(baseConfig, {
          removeParameters: ['missing'],
        })
      ).rejects.toThrow('Parameter does not exist: missing');

      await expect(
        manager.validateUpdates(baseConfig, {
          parameters: { token: 'abc' },
          removeParameters: ['token'],
        })
      ).rejects.toThrow('Conflict: Cannot update and remove the same parameter: token');
    });

    it('validates build number, artifact rules, and timeout', async () => {
      await expect(
        manager.validateUpdates(baseConfig, { buildNumberFormat: 'invalid-format' })
      ).rejects.toThrow('Invalid build number format: invalid-format');

      await expect(
        manager.validateUpdates(baseConfig, { artifactRules: 'bad\\\\path' })
      ).rejects.toThrow('Invalid artifact rules: bad\\\\path');

      await expect(
        manager.validateUpdates(baseConfig, {
          buildOptions: { executionTimeout: 2000 },
        })
      ).rejects.toThrow('Execution timeout must be between 0 and 1440 minutes');

      await expect(
        manager.validateUpdates(baseConfig, {
          parameters: { env: 'prod' },
          removeParameters: ['token'],
          buildOptions: { executionTimeout: 30 },
        })
      ).resolves.toBe(true);
    });
  });

  describe('applyUpdates', () => {
    const updatedConfig: BuildConfiguration = {
      ...baseConfig,
      name: 'Renamed Config',
      description: 'Updated description',
      buildNumberFormat: '%build.number%',
      artifactRules: 'logs => logs',
      parameters: { env: 'prod' },
      buildOptions: {
        cleanBuild: true,
        executionTimeout: 45,
        checkoutDirectory: '.teamcity',
      },
    };

    it('applies updates and returns refreshed configuration', async () => {
      const retrieveSpy = jest
        .spyOn(manager, 'retrieveConfiguration')
        .mockResolvedValue(updatedConfig);

      await manager.applyUpdates(baseConfig, {
        name: 'Renamed Config',
        description: 'Updated description',
        buildNumberFormat: '%build.number%',
        artifactRules: 'logs => logs',
        parameters: { env: 'prod' },
        removeParameters: ['token'],
        buildOptions: {
          cleanBuild: true,
          executionTimeout: 45,
        },
      });

      expect(mockClient.buildTypes.setBuildTypeField).toHaveBeenCalledWith(
        'cfg1',
        'name',
        'Renamed Config',
        { headers: { 'Content-Type': 'text/plain', Accept: 'text/plain' } }
      );
      expect(mockClient.buildTypes.setBuildTypeField).toHaveBeenCalledWith(
        'cfg1',
        'settings/buildNumberPattern',
        '%build.number%',
        { headers: { 'Content-Type': 'text/plain', Accept: 'text/plain' } }
      );
      expect(mockClient.buildTypes.deleteBuildParameterOfBuildType_2).toHaveBeenCalledWith(
        'token',
        'cfg1'
      );
      expect(retrieveSpy).toHaveBeenCalledWith('cfg1');
      retrieveSpy.mockRestore();
    });

    it('falls back to legacy artifactRules path when settings path is rejected', async () => {
      const error = Object.assign(new Error('bad request'), {
        response: { status: 400 },
      });
      // First http.put call for settings/artifactRules fails
      (mockClient.http.put as jest.Mock).mockRejectedValueOnce(error);
      const retrieveSpy = jest
        .spyOn(manager, 'retrieveConfiguration')
        .mockResolvedValue({ ...updatedConfig, artifactRules: 'dist/** => archive.zip' });

      await expect(
        manager.applyUpdates(baseConfig, {
          artifactRules: 'dist/** => archive.zip',
        })
      ).resolves.toEqual({ ...updatedConfig, artifactRules: 'dist/** => archive.zip' });

      // Uses direct HTTP PUT (not OpenAPI client) with unencoded slashes in path
      expect(mockClient.http.put).toHaveBeenNthCalledWith(
        1,
        '/app/rest/buildTypes/cfg1/settings/artifactRules',
        'dist/** => archive.zip',
        { headers: { 'Content-Type': 'text/plain', Accept: 'text/plain' } }
      );
      expect(mockClient.http.put).toHaveBeenNthCalledWith(
        2,
        '/app/rest/buildTypes/cfg1/artifactRules',
        'dist/** => archive.zip',
        { headers: { 'Content-Type': 'text/plain', Accept: 'text/plain' } }
      );

      retrieveSpy.mockRestore();
    });

    it('continues when parameter deletion fails', async () => {
      mockClient.buildTypes.deleteBuildParameterOfBuildType_2.mockRejectedValueOnce(
        new Error('temporary')
      );
      const retrieveSpy = jest
        .spyOn(manager, 'retrieveConfiguration')
        .mockResolvedValue(updatedConfig);

      await expect(
        manager.applyUpdates(baseConfig, {
          removeParameters: ['token'],
        })
      ).resolves.toEqual(updatedConfig);

      expect(mockClient.buildTypes.deleteBuildParameterOfBuildType_2).toHaveBeenCalled();
      expect(retrieveSpy).toHaveBeenCalled();
      retrieveSpy.mockRestore();
    });

    it('maps API errors to friendly messages', async () => {
      const err = Object.assign(new Error('conflict'), {
        response: { status: 409 },
      });
      mockClient.buildTypes.setBuildTypeField.mockRejectedValueOnce(err);

      await expect(
        manager.applyUpdates(baseConfig, {
          name: 'new name',
        })
      ).rejects.toThrow('Configuration was modified by another user');

      mockClient.buildTypes.setBuildTypeField.mockRejectedValueOnce(
        Object.assign(new Error('forbidden'), { response: { status: 403 } })
      );
      await expect(manager.applyUpdates(baseConfig, { name: 'x' })).rejects.toThrow(
        'Permission denied: You need project edit permissions'
      );

      mockClient.buildTypes.setBuildTypeField.mockRejectedValueOnce(
        Object.assign(new Error('bad request'), {
          response: { status: 400, data: { message: 'bad field' } },
        })
      );
      await expect(manager.applyUpdates(baseConfig, { name: 'x' })).rejects.toThrow(
        'Invalid update: bad field'
      );
    });

    it('wraps unknown failures with partial update error', async () => {
      mockClient.buildTypes.setBuildTypeField.mockRejectedValueOnce(new Error('unexpected'));

      await expect(manager.applyUpdates(baseConfig, { name: 'x' })).rejects.toThrow(
        'Partial update failure'
      );
    });
  });

  describe('generateChangeLog', () => {
    it('captures field, parameter, and option changes', () => {
      const changeLog = manager.generateChangeLog(baseConfig, {
        name: 'Updated',
        description: 'New description',
        buildNumberFormat: '%build.number%',
        artifactRules: 'logs => logs',
        parameters: { env: 'prod', token: '999', newParam: 'value' },
        removeParameters: ['token'],
        buildOptions: {
          cleanBuild: true,
          executionTimeout: 60,
          checkoutDirectory: '.teamcity/override',
        },
      });

      expect(changeLog['name']).toEqual({ before: 'Sample Config', after: 'Updated' });
      expect(changeLog['parameters']).toMatchObject({
        added: { newParam: 'value' },
        updated: { env: { before: 'dev', after: 'prod' } },
        removed: ['token'],
      });
      expect(changeLog['buildOptions']).toMatchObject({
        cleanBuild: { before: false, after: true },
        executionTimeout: { before: 30, after: 60 },
      });
    });
  });

  describe('rollbackChanges', () => {
    it('reapplies original configuration', async () => {
      const applySpy = jest.spyOn(manager, 'applyUpdates').mockResolvedValue(baseConfig);

      await manager.rollbackChanges('cfg1', baseConfig);
      expect(applySpy).toHaveBeenCalledWith(baseConfig, {
        name: baseConfig.name,
        description: baseConfig.description,
        buildNumberFormat: baseConfig.buildNumberFormat,
        artifactRules: baseConfig.artifactRules,
        parameters: baseConfig.parameters,
      });
      applySpy.mockRestore();
    });

    it('raises when rollback fails', async () => {
      const applySpy = jest.spyOn(manager, 'applyUpdates').mockRejectedValue(new Error('boom'));

      await expect(manager.rollbackChanges('cfg1', baseConfig)).rejects.toThrow(
        'Rollback failed: Manual intervention may be required'
      );
      applySpy.mockRestore();
    });
  });
});
