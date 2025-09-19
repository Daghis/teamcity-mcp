/**
 * Tests for BuildStepManager
 *
 * Verifies build step management functionality including:
 * - Listing build steps
 * - Creating new build steps
 * - Updating existing steps
 * - Deleting steps
 * - Reordering steps
 * - Error handling
 */
import { BuildStepManager, type RunnerType } from '@/teamcity/build-step-manager';
import {
  BuildConfigurationNotFoundError,
  BuildStepNotFoundError,
  PermissionDeniedError,
  TeamCityAPIError,
  ValidationError,
} from '@/teamcity/errors';

import {
  type MockBuildTypeApi,
  type MockTeamCityClient,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

describe('BuildStepManager', () => {
  let manager: BuildStepManager;
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
    buildTypesApi.getAllBuildSteps.mockImplementation((configId: string, fields?: string) =>
      http.get(
        fields ? `/app/rest/buildTypes/${configId}/steps?fields=${fields}` : `/app/rest/buildTypes/${configId}/steps`
      )
    );
    buildTypesApi.addBuildStepToBuildType.mockImplementation(
      (configId: string, _fields?: string, body?: unknown) =>
        http.post(`/app/rest/buildTypes/${configId}/steps`, body)
    );
    buildTypesApi.replaceBuildStep.mockImplementation(
      (configId: string, stepId: string, _fields?: string, body?: unknown) =>
        http.put(`/app/rest/buildTypes/${configId}/steps/${stepId}`, body)
    );
    buildTypesApi.deleteBuildStep.mockImplementation((configId: string, stepId: string) =>
      http.delete(`/app/rest/buildTypes/${configId}/steps/${stepId}`)
    );
    buildTypesApi.replaceAllBuildSteps.mockImplementation(
      (configId: string, _fields?: string, body?: unknown) =>
        http.put(`/app/rest/buildTypes/${configId}/steps`, body)
    );
    manager = new BuildStepManager(mockClient);
  });

  describe('listBuildSteps', () => {
    const mockSteps = {
      count: 3,
      step: [
        {
          id: 'RUNNER_1',
          name: 'Compile',
          type: 'Maven2',
          disabled: false,
          properties: {
            property: [
              { name: 'goals', value: 'clean compile' },
              { name: 'pomLocation', value: 'pom.xml' },
            ],
          },
        },
        {
          id: 'RUNNER_2',
          name: 'Run Tests',
          type: 'simpleRunner',
          disabled: false,
          properties: {
            property: [
              { name: 'script.content', value: 'npm test' },
              { name: 'script.working.directory', value: './' },
            ],
          },
        },
        {
          id: 'RUNNER_3',
          name: 'Package',
          type: 'gradle-runner',
          disabled: true,
          properties: {
            property: [
              { name: 'gradle.tasks', value: 'build' },
              { name: 'gradle.build.file', value: 'build.gradle' },
            ],
          },
        },
      ],
    };

    it('should list all build steps for a configuration', async () => {
      http.get.mockResolvedValue({ data: mockSteps });

      const result = await manager.listBuildSteps({
        configId: 'MyProject_Build',
      });

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(3);
      expect(result.steps[0]).toMatchObject({
        id: 'RUNNER_1',
        name: 'Compile',
        type: 'Maven2',
        enabled: true,
        parameters: {
          goals: 'clean compile',
          pomLocation: 'pom.xml',
        },
      });
    });

    it('should handle empty step list', async () => {
      http.get.mockResolvedValue({ data: { count: 0, step: [] } });

      const result = await manager.listBuildSteps({
        configId: 'MyProject_Build',
      });

      expect(result.success).toBe(true);
      expect(result.steps).toEqual([]);
    });

    it('should handle configuration not found error', async () => {
      http.get.mockRejectedValue({
        response: {
          status: 404,
          data: { message: 'Build configuration not found' },
        },
      });

      await expect(
        manager.listBuildSteps({
          configId: 'NonExistent_Build',
        })
      ).rejects.toThrow(BuildConfigurationNotFoundError);
    });

    it('should handle permission denied error', async () => {
      http.get.mockRejectedValue({
        response: {
          status: 403,
          data: { message: 'Access denied' },
        },
      });

      await expect(
        manager.listBuildSteps({
          configId: 'MyProject_Build',
        })
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('createBuildStep', () => {
    const newStepResponse = {
      id: 'RUNNER_4',
      name: 'Deploy',
      type: 'Docker',
      disabled: false,
      properties: {
        property: [
          { name: 'docker.command', value: 'push' },
          { name: 'docker.image', value: 'myapp:latest' },
        ],
      },
    };

    it('should create a command line step', async () => {
      http.post.mockResolvedValue({ data: newStepResponse });

      const result = await manager.createBuildStep({
        configId: 'MyProject_Build',
        name: 'Deploy',
        type: 'simpleRunner',
        properties: {
          'script.content': 'echo "Deploying..."',
          'script.working.directory': './',
        },
      });

      expect(result.success).toBe(true);
      expect(result.step).toMatchObject({
        id: 'RUNNER_4',
        name: 'Deploy',
      });
    });

    it('should create a Maven step with validation', async () => {
      http.post.mockResolvedValue({ data: newStepResponse });

      const result = await manager.createBuildStep({
        configId: 'MyProject_Build',
        name: 'Build',
        type: 'Maven2',
        properties: {
          goals: 'clean package',
          pomLocation: 'pom.xml',
          'maven.home': '/usr/local/maven',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should validate required parameters for runner type', async () => {
      await expect(
        manager.createBuildStep({
          configId: 'MyProject_Build',
          name: 'Invalid Maven',
          type: 'Maven2',
          properties: {
            // Missing required 'goals' parameter
            pomLocation: 'pom.xml',
          },
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should reject invalid runner type', async () => {
      await expect(
        manager.createBuildStep({
          configId: 'MyProject_Build',
          name: 'Invalid',
          type: 'InvalidRunner' as unknown as RunnerType,
          properties: {},
        })
      ).rejects.toThrow(ValidationError);
    });

    // Comprehensive runner type tests
    describe('Runner Type Creation Tests', () => {
      it('should create a Gradle step with all parameters', async () => {
        http.post.mockResolvedValue({
          data: {
            id: 'RUNNER_5',
            name: 'Gradle Build',
            type: 'gradle-runner',
            properties: {
              property: [
                { name: 'gradle.tasks', value: 'build test' },
                { name: 'gradle.build.file', value: 'build.gradle' },
              ],
            },
          },
        });

        const result = await manager.createBuildStep({
          configId: 'MyProject_Build',
          name: 'Gradle Build',
          type: 'gradle-runner',
          properties: {
            'gradle.tasks': 'build test',
            'gradle.build.file': 'build.gradle',
            'gradle.home': '/usr/local/gradle',
            'gradle-wrapper.path': './gradlew',
          },
        });

        expect(result.success).toBe(true);
        expect(result.step?.type).toBe('gradle-runner');
      });

      it('should create a Docker step with required parameters', async () => {
        http.post.mockResolvedValue({
          data: {
            id: 'RUNNER_6',
            name: 'Docker Build',
            type: 'Docker',
            properties: {
              property: [
                { name: 'docker.command', value: 'build' },
                { name: 'docker.image', value: 'myapp:latest' },
              ],
            },
          },
        });

        const result = await manager.createBuildStep({
          configId: 'MyProject_Build',
          name: 'Docker Build',
          type: 'Docker',
          properties: {
            'docker.command': 'build',
            'docker.image': 'myapp:latest',
            'dockerfile.path': './Dockerfile',
            'docker.push.enabled': 'true',
          },
        });

        expect(result.success).toBe(true);
        expect(result.step?.type).toBe('Docker');
      });

      it('should create a .NET CLI step', async () => {
        http.post.mockResolvedValue({
          data: {
            id: 'RUNNER_7',
            name: 'DotNet Test',
            type: 'dotnet',
            properties: {
              property: [
                { name: 'dotnet.command', value: 'test' },
                { name: 'dotnet.project', value: 'MyProject.csproj' },
              ],
            },
          },
        });

        const result = await manager.createBuildStep({
          configId: 'MyProject_Build',
          name: 'DotNet Test',
          type: 'dotnet',
          properties: {
            'dotnet.command': 'test',
            'dotnet.project': 'MyProject.csproj',
            'dotnet.configuration': 'Release',
            'dotnet.verbosity': 'normal',
          },
        });

        expect(result.success).toBe(true);
        expect(result.step?.type).toBe('dotnet');
      });

      it('should create an MSBuild step', async () => {
        http.post.mockResolvedValue({
          data: {
            id: 'RUNNER_8',
            name: 'MSBuild Compile',
            type: 'MSBuild',
            properties: {
              property: [
                { name: 'msbuild.project', value: 'Solution.sln' },
                { name: 'msbuild.targets', value: 'Build' },
              ],
            },
          },
        });

        const result = await manager.createBuildStep({
          configId: 'MyProject_Build',
          name: 'MSBuild Compile',
          type: 'MSBuild',
          properties: {
            'msbuild.project': 'Solution.sln',
            'msbuild.targets': 'Build',
            'msbuild.configuration': 'Release',
            'msbuild.platform': 'Any CPU',
          },
        });

        expect(result.success).toBe(true);
        expect(result.step?.type).toBe('MSBuild');
      });

      it('should create a Node.js runner step', async () => {
        http.post.mockResolvedValue({
          data: {
            id: 'RUNNER_9',
            name: 'Node Build',
            type: 'nodejs-runner',
            properties: {
              property: [
                { name: 'nodejs.script', value: 'npm run build' },
                { name: 'nodejs.workingDir', value: './' },
              ],
            },
          },
        });

        const result = await manager.createBuildStep({
          configId: 'MyProject_Build',
          name: 'Node Build',
          type: 'nodejs-runner',
          properties: {
            'nodejs.script': 'npm run build',
            'nodejs.workingDir': './',
            'nodejs.npmCommand': 'run',
            'nodejs.nodeVersion': '18',
          },
        });

        expect(result.success).toBe(true);
        expect(result.step?.type).toBe('nodejs-runner');
      });

      it('should create a Python runner step', async () => {
        http.post.mockResolvedValue({
          data: {
            id: 'RUNNER_10',
            name: 'Python Tests',
            type: 'python',
            properties: {
              property: [
                { name: 'python.script', value: 'pytest tests/' },
                { name: 'python.version', value: '3.9' },
              ],
            },
          },
        });

        const result = await manager.createBuildStep({
          configId: 'MyProject_Build',
          name: 'Python Tests',
          type: 'python',
          properties: {
            'python.script': 'pytest tests/',
            'python.version': '3.9',
            'python.workingDir': './',
            'python.virtualenv': 'venv',
          },
        });

        expect(result.success).toBe(true);
        expect(result.step?.type).toBe('python');
      });

      it('should create a Rust cargo runner step', async () => {
        http.post.mockResolvedValue({
          data: {
            id: 'RUNNER_11',
            name: 'Cargo Build',
            type: 'cargo',
            properties: {
              property: [
                { name: 'cargo.command', value: 'build' },
                { name: 'cargo.features', value: '--release' },
              ],
            },
          },
        });

        const result = await manager.createBuildStep({
          configId: 'MyProject_Build',
          name: 'Cargo Build',
          type: 'cargo',
          properties: {
            'cargo.command': 'build',
            'cargo.features': '--release',
            'cargo.workingDir': './',
            'cargo.target': 'x86_64-unknown-linux-gnu',
          },
        });

        expect(result.success).toBe(true);
        expect(result.step?.type).toBe('cargo');
      });

      it('should create a Kotlin Script runner step', async () => {
        http.post.mockResolvedValue({
          data: {
            id: 'RUNNER_12',
            name: 'Kotlin Script',
            type: 'kotlinScript',
            properties: {
              property: [
                { name: 'kotlinScript.content', value: 'println("Building project")' },
                { name: 'kotlinScript.compiler', value: 'kotlinc' },
              ],
            },
          },
        });

        const result = await manager.createBuildStep({
          configId: 'MyProject_Build',
          name: 'Kotlin Script',
          type: 'kotlinScript',
          properties: {
            'kotlinScript.content': 'println("Building project")',
            'kotlinScript.compiler': 'kotlinc',
            'kotlinScript.jvmTarget': '11',
            'kotlinScript.workingDir': './',
          },
        });

        expect(result.success).toBe(true);
        expect(result.step?.type).toBe('kotlinScript');
      });

      // Validation tests for each runner type
      it('should validate Gradle runner required parameters', async () => {
        await expect(
          manager.createBuildStep({
            configId: 'MyProject_Build',
            name: 'Invalid Gradle',
            type: 'gradle-runner',
            properties: {
              // Missing required 'gradle.tasks' parameter
              'gradle.build.file': 'build.gradle',
            },
          })
        ).rejects.toThrow(ValidationError);
      });

      it('should validate Docker runner required parameters', async () => {
        await expect(
          manager.createBuildStep({
            configId: 'MyProject_Build',
            name: 'Invalid Docker',
            type: 'Docker',
            properties: {
              // Missing required 'docker.command' parameter
              'docker.image': 'myapp:latest',
            },
          })
        ).rejects.toThrow(ValidationError);
      });

      it('should validate .NET CLI runner required parameters', async () => {
        await expect(
          manager.createBuildStep({
            configId: 'MyProject_Build',
            name: 'Invalid DotNet',
            type: 'dotnet',
            properties: {
              // Missing required 'dotnet.command' parameter
              'dotnet.project': 'MyProject.csproj',
            },
          })
        ).rejects.toThrow(ValidationError);
      });

      it('should validate MSBuild runner required parameters', async () => {
        await expect(
          manager.createBuildStep({
            configId: 'MyProject_Build',
            name: 'Invalid MSBuild',
            type: 'MSBuild',
            properties: {
              // Missing required 'msbuild.project' parameter
              'msbuild.targets': 'Build',
            },
          })
        ).rejects.toThrow(ValidationError);
      });

      it('should validate Node.js runner required parameters', async () => {
        await expect(
          manager.createBuildStep({
            configId: 'MyProject_Build',
            name: 'Invalid Node',
            type: 'nodejs-runner',
            properties: {
              // Missing required 'nodejs.script' parameter
              'nodejs.workingDir': './',
            },
          })
        ).rejects.toThrow(ValidationError);
      });

      it('should validate Python runner required parameters', async () => {
        await expect(
          manager.createBuildStep({
            configId: 'MyProject_Build',
            name: 'Invalid Python',
            type: 'python',
            properties: {
              // Missing required 'python.script' parameter
              'python.version': '3.9',
            },
          })
        ).rejects.toThrow(ValidationError);
      });

      it('should validate Cargo runner required parameters', async () => {
        await expect(
          manager.createBuildStep({
            configId: 'MyProject_Build',
            name: 'Invalid Cargo',
            type: 'cargo',
            properties: {
              // Missing required 'cargo.command' parameter
              'cargo.features': '--release',
            },
          })
        ).rejects.toThrow(ValidationError);
      });

      it('should validate Kotlin Script runner required parameters', async () => {
        await expect(
          manager.createBuildStep({
            configId: 'MyProject_Build',
            name: 'Invalid Kotlin',
            type: 'kotlinScript',
            properties: {
              // Missing required 'kotlinScript.content' parameter
              'kotlinScript.compiler': 'kotlinc',
            },
          })
        ).rejects.toThrow(ValidationError);
      });
    });
  });

  describe('updateBuildStep', () => {
    it('should update an existing build step', async () => {
      http.put.mockResolvedValue({
        data: {
          id: 'RUNNER_1',
          name: 'Updated Compile',
          type: 'Maven2',
          properties: {
            property: [{ name: 'goals', value: 'clean compile test' }],
          },
        },
      });

      const result = await manager.updateBuildStep({
        configId: 'MyProject_Build',
        stepId: 'RUNNER_1',
        name: 'Updated Compile',
        properties: {
          goals: 'clean compile test',
        },
      });

      expect(result.success).toBe(true);
      expect(result.step).toBeDefined();
      expect(result.step?.name).toBe('Updated Compile');
    });

    it('should handle step not found error', async () => {
      http.put.mockRejectedValue({
        response: {
          status: 404,
          data: { message: 'Build step not found' },
        },
      });

      await expect(
        manager.updateBuildStep({
          configId: 'MyProject_Build',
          stepId: 'INVALID_STEP',
          name: 'Updated',
        })
      ).rejects.toThrow(BuildStepNotFoundError);
    });

    it('should enable/disable a step', async () => {
      http.put.mockResolvedValue({
        data: {
          id: 'RUNNER_1',
          name: 'Test Step',
          type: 'simpleRunner',
          disabled: true,
          properties: {
            property: [],
          },
        },
      });

      const result = await manager.updateBuildStep({
        configId: 'MyProject_Build',
        stepId: 'RUNNER_1',
        enabled: false,
      });

      expect(result.success).toBe(true);
      expect(result.step).toBeDefined();
      expect(result.step?.enabled).toBe(false);
    });
  });

  describe('deleteBuildStep', () => {
    it('should delete a build step', async () => {
      http.delete.mockResolvedValue({ status: 204 });

      const result = await manager.deleteBuildStep({
        configId: 'MyProject_Build',
        stepId: 'RUNNER_3',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('deleted successfully');
    });

    it('should handle step not found error', async () => {
      http.delete.mockRejectedValue({
        response: {
          status: 404,
          data: { message: 'Build step not found' },
        },
      });

      await expect(
        manager.deleteBuildStep({
          configId: 'MyProject_Build',
          stepId: 'INVALID_STEP',
        })
      ).rejects.toThrow(BuildStepNotFoundError);
    });

    it('should handle dependency conflict error', async () => {
      http.delete.mockRejectedValue({
        response: {
          status: 409,
          data: { message: 'Step has dependencies' },
        },
      });

      await expect(
        manager.deleteBuildStep({
          configId: 'MyProject_Build',
          stepId: 'RUNNER_1',
        })
      ).rejects.toThrow(TeamCityAPIError);
    });
  });

  describe('reorderBuildSteps', () => {
    it('should reorder build steps', async () => {
      // Mock the initial get call to list existing steps
      const existingSteps = {
        step: [
          { id: 'RUNNER_1', name: 'Step 1', type: 'simpleRunner', properties: { property: [] } },
          { id: 'RUNNER_2', name: 'Step 2', type: 'simpleRunner', properties: { property: [] } },
          { id: 'RUNNER_3', name: 'Step 3', type: 'simpleRunner', properties: { property: [] } },
        ],
      };
      http.get.mockResolvedValue({ data: existingSteps });

      const reorderedSteps = {
        step: [
          { id: 'RUNNER_2', name: 'Step 2', type: 'simpleRunner', properties: { property: [] } },
          { id: 'RUNNER_1', name: 'Step 1', type: 'simpleRunner', properties: { property: [] } },
          { id: 'RUNNER_3', name: 'Step 3', type: 'simpleRunner', properties: { property: [] } },
        ],
      };

      http.put.mockResolvedValue({ data: reorderedSteps });

      const result = await manager.reorderBuildSteps({
        configId: 'MyProject_Build',
        stepOrder: ['RUNNER_2', 'RUNNER_1', 'RUNNER_3'],
      });

      expect(result.success).toBe(true);
      expect(result.steps).toBeDefined();
      expect(result.steps).toHaveLength(3);
      const firstStep = result.steps?.[0];
      expect(firstStep?.id).toBe('RUNNER_2');
    });

    it('should validate step order matches existing steps', async () => {
      // First get existing steps
      http.get.mockResolvedValue({
        data: {
          step: [
            { id: 'RUNNER_1', name: 'Step 1', type: 'simpleRunner', properties: { property: [] } },
            { id: 'RUNNER_2', name: 'Step 2', type: 'simpleRunner', properties: { property: [] } },
          ],
        },
      });

      await expect(
        manager.reorderBuildSteps({
          configId: 'MyProject_Build',
          stepOrder: ['RUNNER_2', 'RUNNER_999'], // Invalid step ID
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('parseRunnerProperties', () => {
    it('should parse Maven runner properties', () => {
      const properties = {
        property: [
          { name: 'goals', value: 'clean test' },
          { name: 'pomLocation', value: 'pom.xml' },
          { name: 'runnerArgs', value: '-DskipTests=false' },
        ],
      };

      type PrivateAPI = {
        parseRunnerProperties: (t: string, p: unknown) => Record<string, string>;
      };
      const parsed = (manager as unknown as PrivateAPI).parseRunnerProperties('Maven2', properties);

      expect(parsed).toEqual({
        goals: 'clean test',
        pomLocation: 'pom.xml',
        runnerArgs: '-DskipTests=false',
      });
    });

    it('should parse Docker runner properties', () => {
      const properties = {
        property: [
          { name: 'docker.command', value: 'build' },
          { name: 'docker.image', value: 'myapp:latest' },
          { name: 'dockerfile.path', value: './Dockerfile' },
        ],
      };

      type PrivateAPI = {
        parseRunnerProperties: (t: string, p: unknown) => Record<string, string>;
      };
      const parsed = (manager as unknown as PrivateAPI).parseRunnerProperties('Docker', properties);

      expect(parsed).toEqual({
        'docker.command': 'build',
        'docker.image': 'myapp:latest',
        'dockerfile.path': './Dockerfile',
      });
    });
  });

  describe('validateRunnerParameters', () => {
    it('should validate command line runner parameters', () => {
      type PrivateAPI = {
        validateRunnerParameters: (t: string, p: Record<string, string>) => void;
      };
      expect(() => {
        (manager as unknown as PrivateAPI).validateRunnerParameters('simpleRunner', {
          'script.content': 'echo "Hello"',
        });
      }).not.toThrow();
    });

    it('should reject Maven runner without required goals', () => {
      type PrivateAPI = {
        validateRunnerParameters: (t: string, p: Record<string, string>) => void;
      };
      expect(() => {
        (manager as unknown as PrivateAPI).validateRunnerParameters('Maven2', {
          pomLocation: 'pom.xml',
        });
      }).toThrow(ValidationError);
    });

    it('should reject Gradle runner without required tasks', () => {
      type PrivateAPI = {
        validateRunnerParameters: (t: string, p: Record<string, string>) => void;
      };
      expect(() => {
        (manager as unknown as PrivateAPI).validateRunnerParameters('gradle-runner', {
          'gradle.build.file': 'build.gradle',
        });
      }).toThrow(ValidationError);
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      http.get.mockRejectedValue(new Error('Network error'));

      await expect(
        manager.listBuildSteps({
          configId: 'MyProject_Build',
        })
      ).rejects.toThrow(TeamCityAPIError);
    });

    it('should handle malformed API responses', async () => {
      http.get.mockResolvedValue({ data: null });

      await expect(
        manager.listBuildSteps({
          configId: 'MyProject_Build',
        })
      ).rejects.toThrow(TeamCityAPIError);
    });

    it('should handle authentication errors', async () => {
      http.get.mockRejectedValue({
        response: {
          status: 401,
          data: { message: 'Authentication required' },
        },
      });

      await expect(
        manager.listBuildSteps({
          configId: 'MyProject_Build',
        })
      ).rejects.toThrow(TeamCityAPIError);
    });
  });
});
