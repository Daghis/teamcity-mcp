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

  it('create_build_config and clone_build_config return structured JSON', async () => {
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
          let res = await getRequiredTool('create_build_config').handler({
            projectId: 'P1',
            name: 'Build',
            id: 'BT_NEW',
          });
          let payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'create_build_config',
            id: 'BT_NEW',
          });

          res = await getRequiredTool('clone_build_config').handler({
            sourceBuildTypeId: 'BT_SRC',
            name: 'Clone',
            id: 'BT_CLONE',
          });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'clone_build_config',
            id: 'BT_NEW',
          });
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
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ buildTypes: { setBuildTypeField } }) },
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
