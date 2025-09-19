jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'full',
}));

describe('tools: parameters, steps, triggers', () => {
  it('add/update/delete parameter call respective endpoints', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const createBuildParameterOfBuildType = jest.fn(async () => ({}));
          const updateBuildParameterOfBuildType = jest.fn(async () => ({}));
          const deleteBuildParameterOfBuildType = jest.fn(async () => ({}));
          const deleteBuildParameterOfBuildType2 = jest.fn(async () => ({}));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                buildTypes: {
                  createBuildParameterOfBuildType,
                  updateBuildParameterOfBuildType,
                  deleteBuildParameterOfBuildType,
                  deleteBuildParameterOfBuildType_2: deleteBuildParameterOfBuildType2,
                },
              }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          let res = await getRequiredTool('add_parameter').handler({
            buildTypeId: 'bt',
            name: 'k',
            value: 'v',
          });
          let payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'add_parameter',
            buildTypeId: 'bt',
            name: 'k',
          });

          res = await getRequiredTool('update_parameter').handler({
            buildTypeId: 'bt',
            name: 'k',
            value: 'v2',
          });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'update_parameter',
            buildTypeId: 'bt',
            name: 'k',
          });

          res = await getRequiredTool('delete_parameter').handler({ buildTypeId: 'bt', name: 'k' });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'delete_parameter',
            buildTypeId: 'bt',
            name: 'k',
          });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('manage_build_steps add/update/delete', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const addBuildStepToBuildType = jest.fn(async () => ({}));
          const replaceBuildStep = jest.fn(async () => ({}));
          const deleteBuildStep = jest.fn(async () => ({}));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                buildTypes: { addBuildStepToBuildType, replaceBuildStep, deleteBuildStep },
              }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          let res = await getRequiredTool('manage_build_steps').handler({
            buildTypeId: 'bt',
            action: 'add',
            name: 'Run',
            type: 'simpleRunner',
            properties: { 'script.content': 'echo hi' },
          });
          let payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'add_build_step',
            buildTypeId: 'bt',
          });

          res = await getRequiredTool('manage_build_steps').handler({
            buildTypeId: 'bt',
            action: 'update',
            stepId: 'S1',
            properties: { a: 1, b: '2' },
          });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'update_build_step',
            buildTypeId: 'bt',
            stepId: 'S1',
          });
          expect(replaceBuildStep).toHaveBeenCalledWith(
            'bt',
            'S1',
            undefined,
            expect.objectContaining({
              properties: {
                property: expect.arrayContaining([
                  { name: 'a', value: '1' },
                  { name: 'b', value: '2' },
                ]),
              },
            })
          );

          replaceBuildStep.mockClear();

          await getRequiredTool('manage_build_steps').handler({
            buildTypeId: 'bt',
            action: 'update',
            stepId: 'S2',
            properties: { 'script.content': 'echo hi' },
          });

          expect(replaceBuildStep).toHaveBeenCalledWith(
            'bt',
            'S2',
            undefined,
            expect.objectContaining({
              properties: {
                property: expect.arrayContaining([
                  { name: 'script.content', value: 'echo hi' },
                  { name: 'use.custom.script', value: 'true' },
                  { name: 'script.type', value: 'customScript' },
                ]),
              },
            })
          );

          res = await getRequiredTool('manage_build_steps').handler({
            buildTypeId: 'bt',
            action: 'delete',
            stepId: 'S1',
          });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'delete_build_step',
            buildTypeId: 'bt',
            stepId: 'S1',
          });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('manage_build_triggers add/delete', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const addTriggerToBuildType = jest.fn(async () => ({}));
          const deleteTrigger = jest.fn(async () => ({}));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({ buildTypes: { addTriggerToBuildType, deleteTrigger } }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          let res = await getRequiredTool('manage_build_triggers').handler({
            buildTypeId: 'bt',
            action: 'add',
            type: 'vcsTrigger',
            properties: { branchFilter: '+:*' },
          });
          let payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'add_build_trigger',
            buildTypeId: 'bt',
          });

          res = await getRequiredTool('manage_build_triggers').handler({
            buildTypeId: 'bt',
            action: 'delete',
            triggerId: 'T1',
          });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'delete_build_trigger',
            buildTypeId: 'bt',
            triggerId: 'T1',
          });
          resolve();
        })().catch(reject);
      });
    });
  });
});
