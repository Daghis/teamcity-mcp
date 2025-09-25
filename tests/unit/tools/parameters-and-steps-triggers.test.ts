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
          const getBuildStep = jest.fn(async () => ({
            data: {
              id: 'S1',
              name: 'Existing step',
              type: 'simpleRunner',
              disabled: false,
              properties: {
                property: [{ name: 'some.setting', value: 'keep' }],
              },
            },
          }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                buildTypes: {
                  addBuildStepToBuildType,
                  replaceBuildStep,
                  deleteBuildStep,
                  getBuildStep,
                },
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
          expect(getBuildStep).toHaveBeenCalled();
          expect(replaceBuildStep).toHaveBeenCalledWith(
            'bt',
            'S1',
            undefined,
            expect.objectContaining({
              name: 'Existing step',
              type: 'simpleRunner',
              properties: {
                property: expect.arrayContaining([
                  { name: 'a', value: '1' },
                  { name: 'b', value: '2' },
                  { name: 'some.setting', value: 'keep' },
                ]),
              },
            }),
            expect.objectContaining({
              headers: expect.objectContaining({
                'Content-Type': 'application/json',
                Accept: 'application/json',
              }),
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
                  { name: 'some.setting', value: 'keep' },
                ]),
              },
            }),
            expect.objectContaining({
              headers: expect.objectContaining({
                'Content-Type': 'application/json',
                Accept: 'application/json',
              }),
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

  it('manage_build_steps update merges existing step defaults when only script changes', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getBuildStep = jest.fn(async () => ({
            data: {
              id: 'S9',
              name: 'Run script',
              type: 'simpleRunner',
              disabled: false,
              properties: {
                property: [
                  { name: 'script.content', value: 'echo old' },
                  { name: 'some.setting', value: 'keep' },
                ],
              },
            },
          }));
          const replaceBuildStep = jest.fn(async () => ({}));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                buildTypes: {
                  getBuildStep,
                  replaceBuildStep,
                },
              }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');

          await getRequiredTool('manage_build_steps').handler({
            buildTypeId: 'bt',
            action: 'update',
            stepId: 'S9',
            properties: {
              'script.content': 'echo 42',
            },
          });

          expect(getBuildStep).toHaveBeenCalledWith(
            'bt',
            'S9',
            'id,name,type,disabled,properties(property(name,value))',
            expect.objectContaining({
              headers: expect.objectContaining({ Accept: 'application/json' }),
            })
          );
          expect(replaceBuildStep).toHaveBeenCalledWith(
            'bt',
            'S9',
            undefined,
            expect.objectContaining({
              name: 'Run script',
              type: 'simpleRunner',
              disabled: false,
              properties: {
                property: expect.arrayContaining([
                  { name: 'script.content', value: 'echo 42' },
                  { name: 'some.setting', value: 'keep' },
                  { name: 'use.custom.script', value: 'true' },
                  { name: 'script.type', value: 'customScript' },
                ]),
              },
            }),
            expect.objectContaining({
              headers: expect.objectContaining({
                'Content-Type': 'application/json',
                Accept: 'application/json',
              }),
            })
          );

          resolve();
        })().catch(reject);
      });
    });
  });

  it('manage_build_steps update decodes escaped newline sequences in script.content', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const replaceBuildStep = jest.fn(async () => ({})) as jest.Mock;
          const getBuildStep = jest.fn(async () => ({
            data: {
              id: 'S1',
              name: 'Existing step',
              type: 'simpleRunner',
              disabled: false,
              properties: {
                property: [
                  { name: 'script.type', value: 'customScript' },
                  { name: 'use.custom.script', value: 'true' },
                ],
              },
            },
          }));

          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                buildTypes: {
                  replaceBuildStep,
                  getBuildStep,
                },
              }),
            },
          }));

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');

          const scriptWithEscapedNewlines = '#!/bin/bash\\nset -euo pipefail\\necho done';
          await getRequiredTool('manage_build_steps').handler({
            buildTypeId: 'bt',
            action: 'update',
            stepId: 'S1',
            properties: { 'script.content': scriptWithEscapedNewlines },
          });

          const replacement = replaceBuildStep.mock.calls[0]?.[3] as
            | {
                properties?: { property?: Array<{ name?: string; value?: string }> };
              }
            | undefined;
          const scriptEntry = replacement?.properties?.property?.find(
            (prop) => prop?.name === 'script.content'
          );

          expect(scriptEntry).toBeDefined();
          expect(scriptEntry?.value).toBe('#!/bin/bash\nset -euo pipefail\necho done');
          expect(scriptEntry?.value?.includes('\n')).toBe(true);
          expect(scriptEntry?.value?.includes('\\n')).toBe(false);

          resolve();
        })().catch(reject);
      });
    });
  });

  it('manage_build_steps surfaces TeamCity errors with context', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const { TeamCityAPIError } = await import('@/teamcity/errors');
          const replaceBuildStep = jest
            .fn()
            .mockRejectedValue(new TeamCityAPIError('Bad payload', 'VALIDATION_ERROR', 400));
          const getBuildStep = jest.fn(async () => ({
            data: {
              id: 'S9',
              name: 'Existing step',
              type: 'simpleRunner',
              disabled: false,
              properties: {
                property: [{ name: 'script.content', value: 'echo old' }],
              },
            },
          }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                buildTypes: {
                  addBuildStepToBuildType: jest.fn(),
                  replaceBuildStep,
                  deleteBuildStep: jest.fn(),
                  getBuildStep,
                },
              }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('manage_build_steps').handler({
            buildTypeId: 'bt',
            action: 'update',
            stepId: 'S9',
            properties: { 'script.content': 'echo hi' },
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: false,
            error: {
              code: 'TEAMCITY_ERROR',
              message: 'Bad payload',
            },
          });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('manage_build_steps validates required identifiers', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                buildTypes: {
                  addBuildStepToBuildType: jest.fn(),
                  replaceBuildStep: jest.fn(),
                  deleteBuildStep: jest.fn(),
                },
              }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('manage_build_steps').handler({
            buildTypeId: 'bt',
            action: 'update',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
            },
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
