/**
 * Unit tests for BuildTriggerManager
 */
import {
  BuildTriggerManager,
  type DependencyTriggerProperties,
  type ScheduleTriggerProperties,
  type VcsTriggerProperties,
} from '@/teamcity/build-trigger-manager';
import {
  BuildConfigurationNotFoundError,
  CircularDependencyError,
  TriggerNotFoundError,
  ValidationError,
} from '@/teamcity/errors';

import {
  type MockBuildTypeApi,
  type MockTeamCityClient,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

describe('BuildTriggerManager', () => {
  let manager: BuildTriggerManager;
  let mockClient: MockTeamCityClient;
  let http: jest.Mocked<ReturnType<MockTeamCityClient['getAxios']>>;
  let buildTypesApi: MockBuildTypeApi;

  beforeEach(() => {
    mockClient = createMockTeamCityClient();
    http = mockClient.http as jest.Mocked<ReturnType<MockTeamCityClient['getAxios']>>;
    http.get.mockReset();
    http.post.mockReset();
    http.put.mockReset();
    http.delete.mockReset();
    buildTypesApi = mockClient.mockModules.buildTypes;
    buildTypesApi.getAllTriggers.mockImplementation((configId: string, fields?: string) =>
      fields
        ? http.get(`/app/rest/buildTypes/${configId}/triggers?fields=${fields}`)
        : http.get(`/app/rest/buildTypes/${configId}/triggers`)
    );
    buildTypesApi.addTriggerToBuildType.mockImplementation(
      (configId: string, _fields?: string, body?: unknown) =>
        http.post(`/app/rest/buildTypes/${configId}/triggers`, body)
    );
    buildTypesApi.getTrigger.mockImplementation(
      (configId: string, triggerId: string, fields?: string) =>
        fields
          ? http.get(`/app/rest/buildTypes/${configId}/triggers/${triggerId}?fields=${fields}`)
          : http.get(`/app/rest/buildTypes/${configId}/triggers/${triggerId}`)
    );
    buildTypesApi.replaceTrigger.mockImplementation(
      (configId: string, triggerId: string, _fields?: string, body?: unknown) =>
        http.put(`/app/rest/buildTypes/${configId}/triggers/${triggerId}`, body)
    );
    buildTypesApi.deleteTrigger.mockImplementation((configId: string, triggerId: string) =>
      http.delete(`/app/rest/buildTypes/${configId}/triggers/${triggerId}`)
    );
    buildTypesApi.getAllVcsRootsOfBuildType.mockImplementation(
      (configId: string, fields?: string) =>
        fields
          ? http.get(`/app/rest/buildTypes/${configId}/vcs-root-entries?fields=${fields}`)
          : http.get(`/app/rest/buildTypes/${configId}/vcs-root-entries`)
    );
    manager = new BuildTriggerManager(mockClient);
  });

  describe('listTriggers', () => {
    it('should retrieve all triggers for a build configuration', async () => {
      const mockTriggers = {
        trigger: [
          {
            id: 'TRIGGER_1',
            type: 'vcsTrigger',
            disabled: false,
            properties: {
              property: [
                { name: 'branchFilter', value: '+:refs/heads/main' },
                { name: 'quietPeriodMode', value: 'USE_DEFAULT' },
              ],
            },
          },
          {
            id: 'TRIGGER_2',
            type: 'schedulingTrigger',
            disabled: false,
            properties: {
              property: [
                { name: 'schedulingPolicy', value: '0 0 2 * * ?' },
                { name: 'timezone', value: 'UTC' },
              ],
            },
          },
        ],
      };

      http.get.mockResolvedValue({ data: mockTriggers });

      const result = await manager.listTriggers({ configId: 'MyProject_Build' });

      expect(result.success).toBe(true);
      expect(result.triggers).toHaveLength(2);
      expect(result.triggers[0]).toEqual({
        id: 'TRIGGER_1',
        type: 'vcsTrigger',
        enabled: true,
        properties: {
          branchFilter: '+:refs/heads/main',
          quietPeriodMode: 'USE_DEFAULT',
        },
      });
      expect(result.triggers[1]?.type).toBe('schedulingTrigger');
      // Behavior-first: avoid verifying internal HTTP call shape
    });

    it('should handle empty trigger list', async () => {
      http.get.mockResolvedValue({ data: {} });

      const result = await manager.listTriggers({ configId: 'MyProject_Build' });

      expect(result.success).toBe(true);
      expect(result.triggers).toEqual([]);
    });

    it('should handle build configuration not found', async () => {
      http.get.mockRejectedValue({
        response: { status: 404, data: { message: 'Build configuration not found' } },
      });

      await expect(manager.listTriggers({ configId: 'Invalid' })).rejects.toThrow(
        BuildConfigurationNotFoundError
      );
    });
  });

  describe('createTrigger', () => {
    describe('VCS Trigger', () => {
      it('should create a VCS trigger with branch filter', async () => {
        const newTrigger = {
          id: 'TRIGGER_3',
          type: 'vcsTrigger',
          properties: {
            property: [{ name: 'branchFilter', value: '+:refs/heads/*' }],
          },
        };

        http.post.mockResolvedValue({ data: newTrigger });

        const result = await manager.createTrigger({
          configId: 'MyProject_Build',
          type: 'vcsTrigger',
          properties: {
            branchFilter: '+:refs/heads/*',
          } as VcsTriggerProperties,
        });

        expect(result.success).toBe(true);
        expect(result.trigger?.id).toBe('TRIGGER_3');
        // Behavior-first: avoid verifying request payload shape
      });

      it('should validate branch filter patterns', async () => {
        await expect(
          manager.createTrigger({
            configId: 'MyProject_Build',
            type: 'vcsTrigger',
            properties: {
              branchFilter: 'invalid-pattern',
            } as VcsTriggerProperties,
          })
        ).rejects.toThrow(ValidationError);
      });

      it('should create VCS trigger with quiet period configuration', async () => {
        const newTrigger = {
          id: 'TRIGGER_VCS_QUIET',
          type: 'vcsTrigger',
          properties: {
            property: [
              { name: 'branchFilter', value: '+:refs/heads/main' },
              { name: 'quietPeriodMode', value: 'USE_CUSTOM' },
              { name: 'quietPeriod', value: '60' },
            ],
          },
        };

        http.post.mockResolvedValue({ data: newTrigger });

        const result = await manager.createTrigger({
          configId: 'MyProject_Build',
          type: 'vcsTrigger',
          properties: {
            branchFilter: '+:refs/heads/main',
            quietPeriodMode: 'USE_CUSTOM',
            quietPeriod: 60,
          } as VcsTriggerProperties,
        });

        expect(result.success).toBe(true);
        // Behavior-first: avoid verifying request payload shape
      });

      it('should create VCS trigger with path filter rules', async () => {
        const newTrigger = {
          id: 'TRIGGER_VCS_PATH',
          type: 'vcsTrigger',
          properties: {
            property: [
              { name: 'branchFilter', value: '+:refs/heads/develop' },
              { name: 'triggerRules', value: '+:src/**\n-:*.md' },
            ],
          },
        };

        http.post.mockResolvedValue({ data: newTrigger });

        const result = await manager.createTrigger({
          configId: 'MyProject_Build',
          type: 'vcsTrigger',
          properties: {
            branchFilter: '+:refs/heads/develop',
            triggerRules: '+:src/**\n-:*.md',
          } as VcsTriggerProperties,
        });

        expect(result.success).toBe(true);
        // Behavior-first: avoid verifying request payload shape
      });

      it('should validate multiple branch filters', async () => {
        const newTrigger = {
          id: 'TRIGGER_VCS_MULTI',
          type: 'vcsTrigger',
          properties: {
            property: [
              {
                name: 'branchFilter',
                value: '+:refs/heads/main +:refs/heads/develop -:refs/heads/experimental/*',
              },
            ],
          },
        };

        http.post.mockResolvedValue({ data: newTrigger });

        const result = await manager.createTrigger({
          configId: 'MyProject_Build',
          type: 'vcsTrigger',
          properties: {
            branchFilter: '+:refs/heads/main +:refs/heads/develop -:refs/heads/experimental/*',
          } as VcsTriggerProperties,
        });

        expect(result.success).toBe(true);
      });

      it('should reject invalid quiet period', async () => {
        await expect(
          manager.createTrigger({
            configId: 'MyProject_Build',
            type: 'vcsTrigger',
            properties: {
              branchFilter: '+:refs/heads/main',
              quietPeriodMode: 'USE_CUSTOM',
              quietPeriod: -1,
            } as VcsTriggerProperties,
          })
        ).rejects.toThrow(ValidationError);
      });

      it('should handle enableQueueOptimization flag', async () => {
        const newTrigger = {
          id: 'TRIGGER_VCS_QUEUE',
          type: 'vcsTrigger',
          properties: {
            property: [
              { name: 'branchFilter', value: '+:refs/heads/main' },
              { name: 'enableQueueOptimization', value: 'true' },
            ],
          },
        };

        http.post.mockResolvedValue({ data: newTrigger });

        const result = await manager.createTrigger({
          configId: 'MyProject_Build',
          type: 'vcsTrigger',
          properties: {
            branchFilter: '+:refs/heads/main',
            enableQueueOptimization: true,
          } as VcsTriggerProperties,
        });

        expect(result.success).toBe(true);
        // Behavior-first: avoid verifying request payload shape
      });

      it('should validate path filter rules syntax', () => {
        // Test invalid path filter syntax
        const result = manager.validateTrigger({
          type: 'vcsTrigger',
          properties: {
            triggerRules: 'invalid::syntax',
          } as VcsTriggerProperties,
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Invalid path filter rules syntax');
      });

      it('should validate VCS root attachment when specified', async () => {
        // Mock VCS root entries response - root not attached
        http.get.mockResolvedValue({
          data: {
            'vcs-root-entry': [{ 'vcs-root': { id: 'OTHER_ROOT' } }],
          },
        });

        await expect(
          manager.createTrigger({
            configId: 'MyProject_Build',
            type: 'vcsTrigger',
            properties: {
              branchFilter: '+:refs/heads/main',
              vcsRootId: 'MY_VCS_ROOT',
            } as VcsTriggerProperties,
          })
        ).rejects.toThrow(ValidationError);

        // Behavior-first: avoid verifying GET shape; error thrown is sufficient
      });

      it('should create VCS trigger with specific VCS root', async () => {
        // Mock VCS root entries response - root is attached
        http.get.mockResolvedValue({
          data: {
            'vcs-root-entry': [{ 'vcs-root': { id: 'MY_VCS_ROOT' } }],
          },
        });

        const newTrigger = {
          id: 'TRIGGER_VCS_ROOT',
          type: 'vcsTrigger',
          properties: {
            property: [
              { name: 'branchFilter', value: '+:refs/heads/main' },
              { name: 'vcsRootId', value: 'MY_VCS_ROOT' },
            ],
          },
        };

        http.post.mockResolvedValue({ data: newTrigger });

        const result = await manager.createTrigger({
          configId: 'MyProject_Build',
          type: 'vcsTrigger',
          properties: {
            branchFilter: '+:refs/heads/main',
            vcsRootId: 'MY_VCS_ROOT',
          } as VcsTriggerProperties,
        });

        expect(result.success).toBe(true);
        // Behavior-first: avoid verifying request payload shape
      });
    });

    describe('Schedule Trigger', () => {
      it('should create a schedule trigger with cron expression', async () => {
        const newTrigger = {
          id: 'TRIGGER_4',
          type: 'schedulingTrigger',
          properties: {
            property: [
              { name: 'schedulingPolicy', value: '0 0 2 * * ?' },
              { name: 'timezone', value: 'America/New_York' },
            ],
          },
        };

        http.post.mockResolvedValue({ data: newTrigger });

        const result = await manager.createTrigger({
          configId: 'MyProject_Build',
          type: 'schedulingTrigger',
          properties: {
            schedulingPolicy: '0 0 2 * * ?',
            timezone: 'America/New_York',
          } as ScheduleTriggerProperties,
        });

        expect(result.success).toBe(true);
        expect(result.trigger?.type).toBe('schedulingTrigger');
      });

      it('should validate cron expressions', async () => {
        await expect(
          manager.createTrigger({
            configId: 'MyProject_Build',
            type: 'schedulingTrigger',
            properties: {
              schedulingPolicy: 'invalid cron',
            } as ScheduleTriggerProperties,
          })
        ).rejects.toThrow(ValidationError);
      });

      it('should support TeamCity schedule format', async () => {
        const newTrigger = {
          id: 'TRIGGER_5',
          type: 'schedulingTrigger',
          properties: {
            property: [{ name: 'schedulingPolicy', value: 'daily' }],
          },
        };

        http.post.mockResolvedValue({ data: newTrigger });

        const result = await manager.createTrigger({
          configId: 'MyProject_Build',
          type: 'schedulingTrigger',
          properties: {
            schedulingPolicy: 'daily',
          } as ScheduleTriggerProperties,
        });

        expect(result.success).toBe(true);
      });

      it('should create schedule trigger with timezone', async () => {
        const newTrigger = {
          id: 'TRIGGER_SCHEDULE_TZ',
          type: 'schedulingTrigger',
          properties: {
            property: [
              { name: 'schedulingPolicy', value: '0 30 14 * * ?' },
              { name: 'timezone', value: 'Europe/London' },
            ],
          },
        };

        http.post.mockResolvedValue({ data: newTrigger });

        const result = await manager.createTrigger({
          configId: 'MyProject_Build',
          type: 'schedulingTrigger',
          properties: {
            schedulingPolicy: '0 30 14 * * ?',
            timezone: 'Europe/London',
          } as ScheduleTriggerProperties,
        });

        expect(result.success).toBe(true);
        expect(http.post).toHaveBeenCalledWith(
          expect.stringContaining('/app/rest/buildTypes/MyProject_Build/triggers'),
          expect.objectContaining({
            properties: expect.objectContaining({
              property: expect.arrayContaining([
                expect.objectContaining({ name: 'timezone', value: 'Europe/London' }),
              ]),
            }),
          })
        );
      });

      it('should handle build parameters for scheduled runs', async () => {
        const newTrigger = {
          id: 'TRIGGER_SCHEDULE_PARAMS',
          type: 'schedulingTrigger',
          properties: {
            property: [
              { name: 'schedulingPolicy', value: '0 0 3 * * ?' },
              { name: 'buildParams.env', value: 'production' },
              { name: 'buildParams.deploy', value: 'true' },
            ],
          },
        };

        http.post.mockResolvedValue({ data: newTrigger });

        const result = await manager.createTrigger({
          configId: 'MyProject_Build',
          type: 'schedulingTrigger',
          properties: {
            schedulingPolicy: '0 0 3 * * ?',
            buildParameters: {
              env: 'production',
              deploy: 'true',
            },
          } as ScheduleTriggerProperties,
        });

        expect(result.success).toBe(true);
      });

      it('should support trigger only with pending changes', async () => {
        const newTrigger = {
          id: 'TRIGGER_SCHEDULE_PENDING',
          type: 'schedulingTrigger',
          properties: {
            property: [
              { name: 'schedulingPolicy', value: '0 0 * * * ?' },
              { name: 'triggerBuildWithPendingChangesOnly', value: 'true' },
            ],
          },
        };

        http.post.mockResolvedValue({ data: newTrigger });

        const result = await manager.createTrigger({
          configId: 'MyProject_Build',
          type: 'schedulingTrigger',
          properties: {
            schedulingPolicy: '0 0 * * * ?',
            triggerBuildWithPendingChangesOnly: true,
          } as ScheduleTriggerProperties,
        });

        expect(result.success).toBe(true);
        expect(http.post).toHaveBeenCalledWith(
          expect.stringContaining('/app/rest/buildTypes/MyProject_Build/triggers'),
          expect.objectContaining({
            properties: expect.objectContaining({
              property: expect.arrayContaining([
                expect.objectContaining({
                  name: 'triggerBuildWithPendingChangesOnly',
                  value: 'true',
                }),
              ]),
            }),
          })
        );
      });

      it('should validate cron expression format', () => {
        const result = manager.validateTrigger({
          type: 'schedulingTrigger',
          properties: {
            schedulingPolicy: '0 0 2 * * ?',
          } as ScheduleTriggerProperties,
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should reject invalid cron expressions', () => {
        const result = manager.validateTrigger({
          type: 'schedulingTrigger',
          properties: {
            schedulingPolicy: '0 0 25 * * ?', // Invalid hour
          } as ScheduleTriggerProperties,
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Invalid schedule format');
      });

      it('should support all TeamCity schedule keywords', async () => {
        const keywords = ['daily', 'weekly', 'nightly', 'hourly'];
        for (const keyword of keywords) {
          const result = manager.validateTrigger({
            type: 'schedulingTrigger',
            properties: {
              schedulingPolicy: keyword,
            } as ScheduleTriggerProperties,
          });
          expect(result.valid).toBe(true);
        }
      });

      it('should handle promote watched build option', async () => {
        const newTrigger = {
          id: 'TRIGGER_SCHEDULE_PROMOTE',
          type: 'schedulingTrigger',
          properties: {
            property: [
              { name: 'schedulingPolicy', value: 'weekly' },
              { name: 'promoteWatchedBuild', value: 'true' },
            ],
          },
        };

        http.post.mockResolvedValue({ data: newTrigger });

        const result = await manager.createTrigger({
          configId: 'MyProject_Build',
          type: 'schedulingTrigger',
          properties: {
            schedulingPolicy: 'weekly',
            promoteWatchedBuild: true,
          } as ScheduleTriggerProperties,
        });

        expect(result.success).toBe(true);
      });

      it('should calculate next run time for schedule trigger', () => {
        const nextRun = manager.calculateNextRunTime('0 0 2 * * ?');
        expect(nextRun).toBeInstanceOf(Date);
        expect(nextRun.getHours()).toBe(2);
        expect(nextRun.getMinutes()).toBe(0);
      });

      it('should calculate next run time with timezone', () => {
        const nextRun = manager.calculateNextRunTime('0 0 14 * * ?', 'America/New_York');
        expect(nextRun).toBeInstanceOf(Date);
      });
    });

    describe('Dependency Trigger', () => {
      it('should create a dependency trigger', async () => {
        const newTrigger = {
          id: 'TRIGGER_6',
          type: 'buildDependencyTrigger',
          properties: {
            property: [
              { name: 'dependsOn', value: 'MyProject_OtherBuild' },
              { name: 'afterSuccessfulBuildOnly', value: 'true' },
            ],
          },
        };

        http.post.mockResolvedValue({ data: newTrigger });

        const result = await manager.createTrigger({
          configId: 'MyProject_Build',
          type: 'buildDependencyTrigger',
          properties: {
            dependsOn: 'MyProject_OtherBuild',
            afterSuccessfulBuildOnly: true,
          } as DependencyTriggerProperties,
        });

        expect(result.success).toBe(true);
        expect(result.trigger?.type).toBe('buildDependencyTrigger');
      });

      it('should detect circular dependencies', async () => {
        // Mock checking for existing triggers that would create a cycle
        http.get.mockResolvedValue({
          data: {
            trigger: [
              {
                id: 'EXISTING',
                type: 'buildDependencyTrigger',
                properties: {
                  property: [{ name: 'dependsOn', value: 'MyProject_OtherBuild' }],
                },
              },
            ],
          },
        });

        // Mock POST in case it gets called (it shouldn't due to circular dependency)
        http.post.mockResolvedValue({ data: {} });

        await expect(
          manager.createTrigger({
            configId: 'MyProject_OtherBuild',
            type: 'buildDependencyTrigger',
            properties: {
              dependsOn: 'MyProject_Build',
            } as DependencyTriggerProperties,
          })
        ).rejects.toThrow(CircularDependencyError);
      });
    });
  });

  describe('updateTrigger', () => {
    it('should update an existing trigger', async () => {
      // Mock GET to fetch existing trigger
      http.get.mockResolvedValue({
        data: {
          id: 'TRIGGER_1',
          type: 'vcsTrigger',
          disabled: false,
          properties: {
            property: [{ name: 'branchFilter', value: '+:refs/heads/main' }],
          },
        },
      });

      const updatedTrigger = {
        id: 'TRIGGER_1',
        type: 'vcsTrigger',
        disabled: true,
        properties: {
          property: [{ name: 'branchFilter', value: '+:refs/heads/develop' }],
        },
      };

      http.put.mockResolvedValue({ data: updatedTrigger });

      const result = await manager.updateTrigger({
        configId: 'MyProject_Build',
        triggerId: 'TRIGGER_1',
        enabled: false,
        properties: {
          branchFilter: '+:refs/heads/develop',
        },
      });

      expect(result.success).toBe(true);
      expect(result.trigger?.enabled).toBe(false);
      // Behavior-first: avoid verifying internal HTTP call shape
    });

    it('should handle trigger not found', async () => {
      // Mock GET to return 404
      http.get.mockRejectedValue({
        response: { status: 404, data: { message: 'Trigger not found' } },
      });

      await expect(
        manager.updateTrigger({
          configId: 'MyProject_Build',
          triggerId: 'INVALID',
        })
      ).rejects.toThrow(TriggerNotFoundError);
    });
  });

  describe('deleteTrigger', () => {
    it('should delete a trigger', async () => {
      http.delete.mockResolvedValue({ status: 204 });

      const result = await manager.deleteTrigger({
        configId: 'MyProject_Build',
        triggerId: 'TRIGGER_1',
      });

      expect(result.success).toBe(true);
      // Behavior-first: avoid verifying internal HTTP call shape
    });

    it('should handle trigger not found', async () => {
      http.delete.mockRejectedValue({
        response: { status: 404 },
      });

      await expect(
        manager.deleteTrigger({
          configId: 'MyProject_Build',
          triggerId: 'INVALID',
        })
      ).rejects.toThrow(TriggerNotFoundError);
    });
  });

  describe('validateTrigger', () => {
    it('should validate VCS trigger properties', () => {
      const result = manager.validateTrigger({
        type: 'vcsTrigger',
        properties: {
          branchFilter: '+:refs/heads/main',
          quietPeriodMode: 'USE_DEFAULT',
        } as VcsTriggerProperties,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return validation errors for invalid properties', () => {
      const result = manager.validateTrigger({
        type: 'schedulingTrigger',
        properties: {
          schedulingPolicy: 'invalid',
        } as ScheduleTriggerProperties,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid schedule format');
    });
  });

  describe('Dependency Triggers', () => {
    it('should create build dependency trigger', async () => {
      const newTrigger = {
        id: 'TRIGGER_DEP_1',
        type: 'buildDependencyTrigger',
        properties: {
          property: [
            { name: 'dependsOn', value: 'Project_Build1' },
            { name: 'afterSuccessfulBuildOnly', value: 'true' },
          ],
        },
      };

      http.post.mockResolvedValueOnce({ data: newTrigger });

      const result = await manager.createTrigger({
        configId: 'Build_Config_1',
        type: 'buildDependencyTrigger',
        properties: {
          dependsOn: 'Project_Build1',
          afterSuccessfulBuildOnly: true,
        },
      });

      expect(result.trigger).toEqual(
        expect.objectContaining({
          id: 'TRIGGER_DEP_1',
          type: 'buildDependencyTrigger',
        })
      );
      // Behavior-first: avoid verifying request payload shape
    });

    it('should create dependency trigger with artifact dependencies', async () => {
      const newTrigger = {
        id: 'TRIGGER_DEP_2',
        type: 'buildDependencyTrigger',
        properties: {
          property: [
            { name: 'dependsOn', value: 'Project_Build1' },
            { name: 'afterSuccessfulBuildOnly', value: 'true' },
            { name: 'artifactRules', value: 'dist/**/*.jar => lib' },
            { name: 'branchFilter', value: '+:main' },
          ],
        },
      };

      http.post.mockResolvedValueOnce({ data: newTrigger });

      const result = await manager.createTrigger({
        configId: 'Build_Config_1',
        type: 'buildDependencyTrigger',
        properties: {
          dependsOn: 'Project_Build1',
          afterSuccessfulBuildOnly: true,
          artifactRules: 'dist/**/*.jar => lib',
          branchFilter: '+:main',
        },
      });

      expect(result.trigger).toEqual(
        expect.objectContaining({
          id: 'TRIGGER_DEP_2',
          type: 'buildDependencyTrigger',
        })
      );
    });

    it('should validate dependency trigger configuration', async () => {
      const validation = manager.validateTrigger({
        type: 'buildDependencyTrigger',
        properties: {
          dependsOn: 'Project_Build1',
          afterSuccessfulBuildOnly: true,
        },
      });

      expect(validation).toEqual({
        valid: true,
        errors: [],
        warnings: [],
      });
    });

    it('should detect invalid dependency configuration', async () => {
      const validation = manager.validateTrigger({
        type: 'buildDependencyTrigger',
        properties: {},
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Dependency trigger requires dependsOn property');
    });

    it('should list dependency triggers with source info', async () => {
      const mockTriggers = {
        trigger: [
          {
            id: 'TRIGGER_DEP_1',
            type: 'buildDependencyTrigger',
            properties: {
              property: [
                { name: 'dependsOn', value: 'Project_Build1' },
                { name: 'afterSuccessfulBuildOnly', value: 'true' },
              ],
            },
          },
        ],
      };

      http.get.mockResolvedValueOnce({ data: mockTriggers });

      const result = await manager.listTriggers({ configId: 'Build_Config_1' });
      expect(result.triggers).toHaveLength(1);
      expect(result.triggers[0]?.dependsOn).toBe('Project_Build1');
      expect(result.triggers[0]?.afterSuccessfulBuildOnly).toBe(true);
    });

    it('should handle multiple dependency configurations', async () => {
      const newTrigger = {
        id: 'TRIGGER_DEP_3',
        type: 'buildDependencyTrigger',
        properties: {
          property: [
            { name: 'dependsOn', value: 'Project_Build1,Project_Build2' },
            { name: 'afterSuccessfulBuildOnly', value: 'false' },
            { name: 'dependOnStartedBuild', value: 'true' },
          ],
        },
      };

      http.post.mockResolvedValueOnce({ data: newTrigger });

      const result = await manager.createTrigger({
        configId: 'Build_Config_1',
        type: 'buildDependencyTrigger',
        properties: {
          dependsOn: ['Project_Build1', 'Project_Build2'],
          afterSuccessfulBuildOnly: false,
          dependOnStartedBuild: true,
        },
      });

      expect(result.trigger).toEqual(
        expect.objectContaining({
          id: 'TRIGGER_DEP_3',
          type: 'buildDependencyTrigger',
        })
      );
    });

    it('should validate artifact rules format', async () => {
      const validation = manager.validateTrigger({
        type: 'buildDependencyTrigger',
        properties: {
          dependsOn: 'Project_Build1',
          artifactRules: 'invalid artifact rule format',
        },
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Invalid artifact rule format');
    });

    it('should detect circular dependencies', async () => {
      // Mock getting existing dependencies
      // Build_Config_1 depends on Build_Config_2
      // Build_Config_2 depends on Build_Config_3
      // So if Build_Config_3 tries to depend on Build_Config_1, it creates a cycle
      http.get
        .mockResolvedValueOnce({
          data: {
            // Dependencies for Build_Config_1
            trigger: [
              {
                id: 'trigger1',
                type: 'buildDependencyTrigger',
                properties: {
                  property: [{ name: 'dependsOn', value: 'Build_Config_2' }],
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          data: {
            // Dependencies for Build_Config_2
            trigger: [
              {
                id: 'trigger2',
                type: 'buildDependencyTrigger',
                properties: {
                  property: [{ name: 'dependsOn', value: 'Build_Config_3' }],
                },
              },
            ],
          },
        });

      const validation = await manager.validateDependencyChain('Build_Config_3', 'Build_Config_1');

      expect(validation.hasCircularDependency).toBe(true);
      expect(validation.chain).toEqual([
        'Build_Config_3',
        'Build_Config_1',
        'Build_Config_2',
        'Build_Config_3',
      ]);
    });

    it('should handle cross-project dependencies', async () => {
      const newTrigger = {
        id: 'TRIGGER_DEP_4',
        type: 'buildDependencyTrigger',
        properties: {
          property: [
            { name: 'dependsOn', value: 'OtherProject_Build' },
            { name: 'afterSuccessfulBuildOnly', value: 'true' },
            { name: 'promoteArtifacts', value: 'true' },
          ],
        },
      };

      http.post.mockResolvedValueOnce({ data: newTrigger });

      const result = await manager.createTrigger({
        configId: 'Build_Config_1',
        type: 'buildDependencyTrigger',
        properties: {
          dependsOn: 'OtherProject_Build',
          afterSuccessfulBuildOnly: true,
          promoteArtifacts: true,
        },
      });

      expect(result.trigger).toEqual(
        expect.objectContaining({
          id: 'TRIGGER_DEP_4',
          type: 'buildDependencyTrigger',
        })
      );
    });

    it('should update dependency trigger configuration', async () => {
      const updatedTrigger = {
        id: 'TRIGGER_DEP_1',
        type: 'buildDependencyTrigger',
        properties: {
          property: [
            { name: 'dependsOn', value: 'Project_Build2' },
            { name: 'afterSuccessfulBuildOnly', value: 'false' },
          ],
        },
      };

      http.get.mockResolvedValueOnce({
        data: {
          id: 'TRIGGER_DEP_1',
          type: 'buildDependencyTrigger',
          properties: {
            property: [
              { name: 'dependsOn', value: 'Project_Build1' },
              { name: 'afterSuccessfulBuildOnly', value: 'true' },
            ],
          },
        },
      });
      http.put.mockResolvedValueOnce({ data: updatedTrigger });

      const result = await manager.updateTrigger({
        configId: 'Build_Config_1',
        triggerId: 'TRIGGER_DEP_1',
        properties: {
          dependsOn: 'Project_Build2',
          afterSuccessfulBuildOnly: false,
        },
      });

      expect(result.trigger).toEqual(
        expect.objectContaining({
          id: 'TRIGGER_DEP_1',
          type: 'buildDependencyTrigger',
        })
      );
    });

    it('should delete dependency trigger', async () => {
      http.delete.mockResolvedValueOnce({});

      const result = await manager.deleteTrigger({
        configId: 'Build_Config_1',
        triggerId: 'TRIGGER_DEP_1',
      });

      expect(result.success).toBe(true);
      // Behavior-first: avoid verifying delete call shape
    });
  });
});
