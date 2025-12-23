// Full mode for write tools
// Use required tool helper to avoid undefined checks

jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'full',
}));

describe('tools: project/build CRUD & updates', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('create_project and delete_project return structured JSON', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const addProject = jest.fn(async () => ({ data: { id: 'P1' } }));
          const deleteProject = jest.fn(async () => ({}));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ projects: { addProject, deleteProject } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          let res = await getRequiredTool('create_project').handler({ name: 'Proj', id: 'P1' });
          let payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ success: true, action: 'create_project', id: 'P1' });

          res = await getRequiredTool('delete_project').handler({ projectId: 'P1' });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ success: true, action: 'delete_project', id: 'P1' });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('create_build_config returns structured JSON', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const createBuildType = jest.fn(async () => ({ data: { id: 'BT_NEW' } }));
          const getBuildType = jest.fn(async () => ({ id: 'BT_SRC', project: { id: 'P1' } }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({ buildTypes: { createBuildType }, getBuildType }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('create_build_config').handler({
            projectId: 'P1',
            name: 'Build',
            id: 'BT_NEW',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'create_build_config',
            id: 'BT_NEW',
          });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('clone_build_config delegates to BuildConfigurationCloneManager and returns metadata', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const retrieveConfiguration = jest.fn(async () => ({
            id: 'BT_SRC',
            name: 'Source Config',
            projectId: 'P1',
          }));
          const cloneConfiguration = jest.fn(async () => ({
            id: 'BT_CLONE',
            name: 'Clone Config',
            projectId: 'P1',
            url: 'https://example.test/viewType.html?buildTypeId=BT_CLONE',
          }));

          const managerCtor = jest
            .fn()
            .mockImplementation(() => ({ retrieveConfiguration, cloneConfiguration }));

          jest.doMock('@/teamcity/build-configuration-clone-manager', () => ({
            BuildConfigurationCloneManager: managerCtor,
          }));

          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                buildTypes: { createBuildType: jest.fn() },
                getBuildType: jest.fn(),
              }),
            },
          }));

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');

          const res = await getRequiredTool('clone_build_config').handler({
            sourceBuildTypeId: 'BT_SRC',
            name: 'Clone Config',
            id: 'BT_CLONE',
            projectId: 'P1',
          });

          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');

          expect(managerCtor).toHaveBeenCalledTimes(1);
          expect(retrieveConfiguration).toHaveBeenCalledWith('BT_SRC');
          expect(cloneConfiguration).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'BT_SRC' }),
            expect.objectContaining({ id: 'BT_CLONE', name: 'Clone Config', targetProjectId: 'P1' })
          );

          expect(payload).toMatchObject({
            success: true,
            action: 'clone_build_config',
            id: 'BT_CLONE',
            name: 'Clone Config',
            projectId: 'P1',
            url: 'https://example.test/viewType.html?buildTypeId=BT_CLONE',
          });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('clone_build_config surfaces descriptive error when source configuration is missing', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const retrieveConfiguration = jest.fn(async () => null);
          const cloneConfiguration = jest.fn();
          const managerCtor = jest
            .fn()
            .mockImplementation(() => ({ retrieveConfiguration, cloneConfiguration }));

          jest.doMock('@/teamcity/build-configuration-clone-manager', () => ({
            BuildConfigurationCloneManager: managerCtor,
          }));

          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                buildTypes: { createBuildType: jest.fn() },
                getBuildType: jest.fn(),
              }),
            },
          }));

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');

          const res = await getRequiredTool('clone_build_config').handler({
            sourceBuildTypeId: 'BT_SRC',
            name: 'Clone Config',
            id: 'BT_CLONE',
          });

          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');

          expect(managerCtor).toHaveBeenCalledTimes(1);
          expect(retrieveConfiguration).toHaveBeenCalledWith('BT_SRC');
          expect(cloneConfiguration).not.toHaveBeenCalled();

          expect(payload).toMatchObject({
            success: false,
            action: 'clone_build_config',
          });
          expect(payload.error).toMatch(/Source build configuration.+BT_SRC/i);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('clone_build_config surfaces manager errors to the caller', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const retrieveConfiguration = jest.fn(async () => ({
            id: 'BT_SRC',
            name: 'Source Config',
            projectId: 'P1',
          }));
          const cloneConfiguration = jest.fn(async () => {
            throw new Error('Permission denied: project requires edit rights');
          });

          const managerCtor = jest
            .fn()
            .mockImplementation(() => ({ retrieveConfiguration, cloneConfiguration }));

          jest.doMock('@/teamcity/build-configuration-clone-manager', () => ({
            BuildConfigurationCloneManager: managerCtor,
          }));

          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                buildTypes: { createBuildType: jest.fn() },
                getBuildType: jest.fn(),
              }),
            },
          }));

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');

          const res = await getRequiredTool('clone_build_config').handler({
            sourceBuildTypeId: 'BT_SRC',
            name: 'Clone Config',
            id: 'BT_CLONE',
            projectId: 'P1',
          });

          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');

          expect(payload.success).toBe(false);
          expect(payload).toMatchObject({ action: 'clone_build_config' });
          expect(String(payload.error)).toContain('Permission denied');

          resolve();
        })().catch(reject);
      });
    });
  });

  it('update_build_config sets fields and returns structured JSON', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const setBuildTypeField = jest.fn(async () => ({}));
          const mockPut = jest.fn(async () => ({ data: 'OK' }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                http: {
                  put: mockPut,
                  defaults: { baseURL: 'https://test.local', timeout: 30000 },
                },
                buildTypes: { setBuildTypeField },
              }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('update_build_config').handler({
            buildTypeId: 'BT1',
            name: 'New Name',
            description: 'Desc',
            paused: true,
            artifactRules: 'artifacts/*.tgz',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'update_build_config',
            id: 'BT1',
          });
          resolve();
        })().catch(reject);
      });
    });
  });
});
