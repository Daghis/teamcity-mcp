import { describe, expect, it, jest } from '@jest/globals';

const originalMode = process.env['MCP_MODE'];

beforeAll(() => {
  process.env['MCP_MODE'] = 'full';
});

afterAll(() => {
  if (typeof originalMode === 'undefined') {
    delete process.env['MCP_MODE'];
  } else {
    process.env['MCP_MODE'] = originalMode;
  }
});

describe('build configuration extended management tools', () => {
  it('manage_build_dependencies add/update/delete artifact and snapshot dependencies', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const addArtifactDependencyToBuildType = jest.fn(async (..._args: unknown[]) => ({
            data: { id: 'artifactDep-1' },
          }));
          const replaceArtifactDependency = jest.fn(async (..._args: unknown[]) => ({
            data: { id: 'artifactDep-1' },
          }));
          const deleteArtifactDependency = jest.fn(async (..._args: unknown[]) => ({}));
          const getArtifactDependency = jest.fn(async (..._args: unknown[]) => ({
            data: {
              id: 'artifactDep-1',
              type: 'artifactDependency',
              properties: {
                property: [{ name: 'cleanDestinationDirectory', value: 'false' }],
              },
              'source-buildType': { id: 'Upstream_Config' },
            },
          }));

          const addSnapshotDependencyToBuildType = jest.fn(async (..._args: unknown[]) => ({
            data: { id: 'snapshotDep-2' },
          }));
          const replaceSnapshotDependency = jest.fn(async (..._args: unknown[]) => ({
            data: { id: 'snapshotDep-2' },
          }));
          const deleteSnapshotDependency = jest.fn(async (..._args: unknown[]) => ({}));
          const getSnapshotDependency = jest.fn(async (..._args: unknown[]) => ({
            data: {
              id: 'snapshotDep-2',
              type: 'snapshotDependency',
              properties: {
                property: [{ name: 'run-build-if-dependency-failed', value: 'false' }],
              },
              options: {
                option: [{ name: 'run-build-on-the-same-agent', value: 'false' }],
              },
              'source-buildType': { id: 'Base_Config' },
            },
          }));

          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                buildTypes: {
                  addArtifactDependencyToBuildType,
                  replaceArtifactDependency,
                  deleteArtifactDependency,
                  getArtifactDependency,
                  addSnapshotDependencyToBuildType,
                  replaceSnapshotDependency,
                  deleteSnapshotDependency,
                  getSnapshotDependency,
                },
              }),
            },
          }));

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');

          let res = await getRequiredTool('manage_build_dependencies').handler({
            buildTypeId: 'Config_A',
            dependencyType: 'artifact',
            action: 'add',
            dependsOn: 'Upstream_Config',
            properties: {
              cleanDestinationDirectory: true,
              pathRules: 'artifacts.zip=>deploy',
            },
          });
          let payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'manage_build_dependencies',
            operation: 'add',
            dependencyType: 'artifact',
            dependencyId: 'artifactDep-1',
          });
          expect(addArtifactDependencyToBuildType).toHaveBeenCalledWith(
            'Config_A',
            undefined,
            expect.objectContaining({
              'source-buildType': { id: 'Upstream_Config' },
              properties: {
                property: expect.arrayContaining([
                  { name: 'cleanDestinationDirectory', value: 'true' },
                  { name: 'pathRules', value: 'artifacts.zip=>deploy' },
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

          res = await getRequiredTool('manage_build_dependencies').handler({
            buildTypeId: 'Config_A',
            dependencyType: 'snapshot',
            action: 'add',
            dependsOn: 'Base_Config',
          });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'manage_build_dependencies',
            operation: 'add',
            dependencyType: 'snapshot',
            dependencyId: 'snapshotDep-2',
          });
          expect(addSnapshotDependencyToBuildType).toHaveBeenCalledWith(
            'Config_A',
            undefined,
            expect.stringMatching(/^<snapshot-dependency\b[\s\S]*<\/snapshot-dependency>$/),
            expect.objectContaining({
              headers: expect.objectContaining({
                'Content-Type': 'application/xml',
                Accept: 'application/json',
              }),
            })
          );
          expect(addSnapshotDependencyToBuildType.mock.calls[0]?.[2]).toContain(
            '<source-buildType id="Base_Config"/>'
          );

          res = await getRequiredTool('manage_build_dependencies').handler({
            buildTypeId: 'Config_A',
            dependencyType: 'artifact',
            action: 'update',
            dependencyId: 'artifactDep-1',
            properties: {
              cleanDestinationDirectory: false,
              revisionName: 'lastSuccessful',
            },
          });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'manage_build_dependencies',
            operation: 'update',
            dependencyType: 'artifact',
            dependencyId: 'artifactDep-1',
          });
          expect(getArtifactDependency).toHaveBeenCalledWith(
            'Config_A',
            'artifactDep-1',
            expect.anything(),
            expect.objectContaining({
              headers: expect.objectContaining({ Accept: 'application/json' }),
            })
          );
          expect(replaceArtifactDependency).toHaveBeenCalledWith(
            'Config_A',
            'artifactDep-1',
            undefined,
            expect.objectContaining({
              properties: {
                property: expect.arrayContaining([
                  { name: 'cleanDestinationDirectory', value: 'false' },
                  { name: 'revisionName', value: 'lastSuccessful' },
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

          res = await getRequiredTool('manage_build_dependencies').handler({
            buildTypeId: 'Config_A',
            dependencyType: 'snapshot',
            action: 'update',
            dependencyId: 'snapshotDep-2',
            dependsOn: 'New_Base_Config',
            properties: {
              'run-build-if-dependency-failed': 'true',
              'run-build-on-the-same-agent': true,
            },
          });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'manage_build_dependencies',
            operation: 'update',
            dependencyType: 'snapshot',
            dependencyId: 'snapshotDep-2',
          });
          expect(getSnapshotDependency).toHaveBeenCalledWith(
            'Config_A',
            'snapshotDep-2',
            expect.anything(),
            expect.objectContaining({
              headers: expect.objectContaining({ Accept: 'application/json' }),
            })
          );
          expect(replaceSnapshotDependency).toHaveBeenCalledWith(
            'Config_A',
            'snapshotDep-2',
            undefined,
            expect.stringMatching(/^<snapshot-dependency\b[\s\S]*<\/snapshot-dependency>$/),
            expect.objectContaining({
              headers: expect.objectContaining({
                'Content-Type': 'application/xml',
                Accept: 'application/json',
              }),
            })
          );
          expect(replaceSnapshotDependency.mock.calls[0]?.[3]).toContain(
            '<source-buildType id="New_Base_Config"/>'
          );
          const updateSnapshotXml = replaceSnapshotDependency.mock.calls[0]?.[3] as string;
          expect(updateSnapshotXml).toContain(
            '<properties><property name="run-build-if-dependency-failed" value="true"/></properties>'
          );
          expect(updateSnapshotXml).toContain(
            '<options><option name="run-build-on-the-same-agent" value="true"/></options>'
          );

          res = await getRequiredTool('manage_build_dependencies').handler({
            buildTypeId: 'Config_A',
            dependencyType: 'snapshot',
            action: 'delete',
            dependencyId: 'snapshotDep-2',
          });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'manage_build_dependencies',
            operation: 'delete',
            dependencyType: 'snapshot',
            dependencyId: 'snapshotDep-2',
          });
          expect(deleteSnapshotDependency).toHaveBeenCalledWith(
            'Config_A',
            'snapshotDep-2',
            expect.anything()
          );

          res = await getRequiredTool('manage_build_dependencies').handler({
            buildTypeId: 'Config_A',
            dependencyType: 'artifact',
            action: 'delete',
            dependencyId: 'artifactDep-1',
          });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'manage_build_dependencies',
            operation: 'delete',
            dependencyType: 'artifact',
            dependencyId: 'artifactDep-1',
          });
          expect(deleteArtifactDependency).toHaveBeenCalledWith(
            'Config_A',
            'artifactDep-1',
            expect.anything()
          );
          resolve();
        })().catch(reject);
      });
    });
  });

  it('manage_build_dependencies surfaces validation error when missing identifiers', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({ buildTypes: {} }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('manage_build_dependencies').handler({
            buildTypeId: 'Cfg',
            dependencyType: 'artifact',
            action: 'update',
            properties: { cleanDestinationDirectory: true },
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(JSON.stringify(payload)).toContain('dependencyId is required for update/delete');
          resolve();
        })().catch(reject);
      });
    });
  });

  it('manage_build_features add/update/delete build features', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const addBuildFeatureToBuildType = jest.fn(async (..._args: unknown[]) => ({
            data: { id: 'FEATURE_1' },
          }));
          const replaceBuildFeature = jest.fn(async (..._args: unknown[]) => ({
            data: { id: 'FEATURE_1' },
          }));
          const deleteFeatureOfBuildType = jest.fn(async (..._args: unknown[]) => ({}));
          const getBuildFeature = jest.fn(async (..._args: unknown[]) => ({
            data: {
              id: 'FEATURE_1',
              type: 'ssh-agent',
              properties: {
                property: [{ name: 'teamcity.ssh.agent.key', value: 'id_rsa' }],
              },
            },
          }));

          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                buildTypes: {
                  addBuildFeatureToBuildType,
                  replaceBuildFeature,
                  deleteFeatureOfBuildType,
                  getBuildFeature,
                },
              }),
            },
          }));

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');

          let res = await getRequiredTool('manage_build_features').handler({
            buildTypeId: 'Cfg_B',
            action: 'add',
            type: 'ssh-agent',
            properties: {
              'teamcity.ssh.agent.key': 'id_rsa',
              'teamcity.ssh.agent.key.passphrase': '***',
            },
          });
          let payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'manage_build_features',
            operation: 'add',
            featureId: 'FEATURE_1',
          });
          expect(addBuildFeatureToBuildType).toHaveBeenCalledWith(
            'Cfg_B',
            undefined,
            expect.objectContaining({
              type: 'ssh-agent',
              properties: {
                property: expect.arrayContaining([
                  { name: 'teamcity.ssh.agent.key', value: 'id_rsa' },
                  { name: 'teamcity.ssh.agent.key.passphrase', value: '***' },
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

          res = await getRequiredTool('manage_build_features').handler({
            buildTypeId: 'Cfg_B',
            action: 'update',
            featureId: 'FEATURE_1',
            properties: {
              'teamcity.ssh.agent.key.passphrase': 'updated',
            },
          });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'manage_build_features',
            operation: 'update',
            featureId: 'FEATURE_1',
          });
          expect(getBuildFeature).toHaveBeenCalledWith(
            'Cfg_B',
            'FEATURE_1',
            expect.anything(),
            expect.objectContaining({
              headers: expect.objectContaining({ Accept: 'application/json' }),
            })
          );
          expect(replaceBuildFeature).toHaveBeenCalledWith(
            'Cfg_B',
            'FEATURE_1',
            undefined,
            expect.objectContaining({
              type: 'ssh-agent',
              properties: {
                property: expect.arrayContaining([
                  { name: 'teamcity.ssh.agent.key', value: 'id_rsa' },
                  { name: 'teamcity.ssh.agent.key.passphrase', value: 'updated' },
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

          res = await getRequiredTool('manage_build_features').handler({
            buildTypeId: 'Cfg_B',
            action: 'delete',
            featureId: 'FEATURE_1',
          });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'manage_build_features',
            operation: 'delete',
            featureId: 'FEATURE_1',
          });
          expect(deleteFeatureOfBuildType).toHaveBeenCalledWith(
            'Cfg_B',
            'FEATURE_1',
            expect.anything()
          );
          resolve();
        })().catch(reject);
      });
    });
  });

  it('manage_build_features validates identifier requirements', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({ buildTypes: {} }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('manage_build_features').handler({
            buildTypeId: 'Cfg_B',
            action: 'update',
            properties: { example: 'value' },
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(JSON.stringify(payload)).toContain('featureId is required for update/delete');
          resolve();
        })().catch(reject);
      });
    });
  });

  it('manage_agent_requirements add/update/delete requirements', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const addAgentRequirementToBuildType = jest.fn(async (..._args: unknown[]) => ({
            data: { id: 'REQ_5' },
          }));
          const getAgentRequirement = jest.fn(async (..._args: unknown[]) => ({
            data: {
              id: 'REQ_5',
              type: 'exists',
              properties: {
                property: [
                  { name: 'property-name', value: 'env.ANSIBLE' },
                  { name: 'condition', value: 'exists' },
                ],
              },
            },
          }));
          const replaceAgentRequirement = jest.fn(async (..._args: unknown[]) => ({
            data: { id: 'REQ_5' },
          }));
          const deleteAgentRequirement = jest.fn(async (..._args: unknown[]) => ({}));

          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                buildTypes: {
                  addAgentRequirementToBuildType,
                  getAgentRequirement,
                  replaceAgentRequirement,
                  deleteAgentRequirement,
                },
              }),
            },
          }));

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');

          let res = await getRequiredTool('manage_agent_requirements').handler({
            buildTypeId: 'Cfg_C',
            action: 'add',
            properties: {
              'property-name': 'env.ANSIBLE',
              condition: 'exists',
            },
          });
          let payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'manage_agent_requirements',
            operation: 'add',
            requirementId: 'REQ_5',
          });
          expect(addAgentRequirementToBuildType).toHaveBeenCalledWith(
            'Cfg_C',
            undefined,
            expect.objectContaining({
              properties: {
                property: expect.arrayContaining([
                  { name: 'property-name', value: 'env.ANSIBLE' },
                  { name: 'condition', value: 'exists' },
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

          res = await getRequiredTool('manage_agent_requirements').handler({
            buildTypeId: 'Cfg_C',
            action: 'update',
            requirementId: 'REQ_5',
            properties: {
              'property-name': 'env.TERRAFORM',
            },
          });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'manage_agent_requirements',
            operation: 'update',
            requirementId: 'REQ_5',
          });
          expect(getAgentRequirement).toHaveBeenCalledWith(
            'Cfg_C',
            'REQ_5',
            expect.anything(),
            expect.objectContaining({
              headers: expect.objectContaining({ Accept: 'application/json' }),
            })
          );
          expect(replaceAgentRequirement).toHaveBeenCalledWith(
            'Cfg_C',
            'REQ_5',
            undefined,
            expect.objectContaining({
              properties: {
                property: expect.arrayContaining([
                  { name: 'property-name', value: 'env.TERRAFORM' },
                  { name: 'condition', value: 'exists' },
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

          res = await getRequiredTool('manage_agent_requirements').handler({
            buildTypeId: 'Cfg_C',
            action: 'delete',
            requirementId: 'REQ_5',
          });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'manage_agent_requirements',
            operation: 'delete',
            requirementId: 'REQ_5',
          });
          expect(deleteAgentRequirement).toHaveBeenCalledWith('Cfg_C', 'REQ_5', expect.anything());
          resolve();
        })().catch(reject);
      });
    });
  });

  it('manage_agent_requirements validates requirement identifiers', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({ buildTypes: {} }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('manage_agent_requirements').handler({
            buildTypeId: 'Cfg_C',
            action: 'delete',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(JSON.stringify(payload)).toContain('requirementId is required for update/delete');
          resolve();
        })().catch(reject);
      });
    });
  });

  it('set_build_config_state toggles paused flag', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const setBuildTypeField = jest.fn(async (..._args: unknown[]) => ({}));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                buildTypes: {
                  setBuildTypeField,
                },
              }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');

          let res = await getRequiredTool('set_build_config_state').handler({
            buildTypeId: 'Cfg_D',
            paused: true,
          });
          let payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'set_build_config_state',
            buildTypeId: 'Cfg_D',
            paused: true,
          });
          expect(setBuildTypeField).toHaveBeenCalledWith(
            'Cfg_D',
            'paused',
            'true',
            expect.objectContaining({
              headers: expect.objectContaining({
                'Content-Type': 'text/plain',
                Accept: 'application/json',
              }),
            })
          );

          res = await getRequiredTool('set_build_config_state').handler({
            buildTypeId: 'Cfg_D',
            paused: false,
          });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'set_build_config_state',
            buildTypeId: 'Cfg_D',
            paused: false,
          });
          expect(setBuildTypeField).toHaveBeenLastCalledWith(
            'Cfg_D',
            'paused',
            'false',
            expect.objectContaining({
              headers: expect.objectContaining({
                'Content-Type': 'text/plain',
                Accept: 'application/json',
              }),
            })
          );
          resolve();
        })().catch(reject);
      });
    });
  });
});
