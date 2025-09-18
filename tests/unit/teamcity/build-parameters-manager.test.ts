/**
 * Tests for Build Parameters Manager
 */
import type { Logger } from 'winston';

import { ResolvedBuildConfiguration } from '@/teamcity/build-configuration-resolver';
import {
  BuildParametersManager,
  ParameterConflictError,
  ParameterSet,
  ParameterType,
  ParameterValidationError,
  type PersonalBuildOptions,
  RequiredParameterError,
} from '@/teamcity/build-parameters-manager';

import {
  type MockTeamCityClient,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

// Mock logger
const mockLogger: Partial<Logger> = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Mock TeamCity client
const mockTeamCityClient: MockTeamCityClient = createMockTeamCityClient();

// Helper to wrap response in Axios format
const wrapResponse = <T>(data: T) => ({ data });

describe('BuildParametersManager', () => {
  let manager: BuildParametersManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTeamCityClient.resetAllMocks();
    manager = new BuildParametersManager({
      client: mockTeamCityClient,
      logger: mockLogger as unknown as Logger,
    });
  });

  describe('Parameter Parsing', () => {
    it('should parse simple key-value parameters', () => {
      const input = {
        'env.NODE_ENV': 'production',
        'system.debug': 'true',
        'build.number': '42',
      };

      const parsed = manager.parseParameters(input);

      expect(parsed).toHaveLength(3);
      expect(parsed[0]).toEqual({
        name: 'env.NODE_ENV',
        value: 'production',
        type: ParameterType.ENVIRONMENT,
        source: 'user',
      });
      expect(parsed[1]).toEqual({
        name: 'system.debug',
        value: 'true',
        type: ParameterType.SYSTEM,
        source: 'user',
      });
      expect(parsed[2]).toEqual({
        name: 'build.number',
        value: '42',
        type: ParameterType.BUILD,
        source: 'user',
      });
    });

    it('should detect parameter types from prefixes', () => {
      const params = manager.parseParameters({
        'env.VAR': 'value1',
        'system.property': 'value2',
        'teamcity.build.id': 'value3',
        'custom.param': 'value4',
      });

      const types = params.map((p) => p.type);
      expect(types).toEqual([
        ParameterType.ENVIRONMENT,
        ParameterType.SYSTEM,
        ParameterType.SYSTEM,
        ParameterType.CONFIGURATION,
      ]);
    });

    it('should handle nested parameter values', () => {
      const input = {
        'deploy.config': JSON.stringify({
          server: 'prod-01',
          port: 8080,
          ssl: true,
        }),
      };

      const parsed = manager.parseParameters(input);

      expect(parsed[0]?.value).toBe(input['deploy.config']);
      expect(parsed[0]?.type).toBe(ParameterType.CONFIGURATION);
    });

    it('should parse parameters from command line format', () => {
      const cliArgs = ['-Penv.NODE_ENV=staging', '-Psystem.verbose=true', '-Pbuild.clean=false'];

      const parsed = manager.parseFromCLI(cliArgs);

      expect(parsed).toHaveLength(3);
      expect(parsed[0]?.name).toBe('env.NODE_ENV');
      expect(parsed[0]?.value).toBe('staging');
      expect(parsed[1]?.name).toBe('system.verbose');
      expect(parsed[1]?.value).toBe('true');
    });

    it('should handle parameters with special characters', () => {
      const input = {
        'connection.string': 'Server=localhost;Database=test;User Id=admin;Password=p@ss!',
        'file.path': '/usr/local/bin/app',
        'regex.pattern': '^[a-zA-Z0-9]+$',
      };

      const parsed = manager.parseParameters(input);

      expect(parsed[0]?.value).toBe(input['connection.string']);
      expect(parsed[1]?.value).toBe(input['file.path']);
      expect(parsed[2]?.value).toBe(input['regex.pattern']);
    });
  });

  describe('Parameter Validation', () => {
    it('should validate required parameters', async () => {
      const buildConfig: ResolvedBuildConfiguration = {
        id: 'Build1',
        name: 'Test Build',
        projectId: 'Project1',
        projectName: 'Test Project',
        paused: false,
        templateFlag: false,
        allowPersonalBuilds: false,
        parameters: {
          'env.REQUIRED_VAR': '',
          'system.optional': 'default',
        },
      };

      const requiredParams = ['env.REQUIRED_VAR'];
      const providedParams = manager.parseParameters({
        'env.REQUIRED_VAR': 'provided_value',
      });

      const validation = manager.validateParameters(providedParams, buildConfig, {
        requiredParameters: requiredParams,
      });

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should fail validation for missing required parameters', async () => {
      const buildConfig: ResolvedBuildConfiguration = {
        id: 'Build1',
        name: 'Test Build',
        projectId: 'Project1',
        projectName: 'Test Project',
        paused: false,
        templateFlag: false,
        allowPersonalBuilds: false,
      };

      const requiredParams = ['env.REQUIRED_VAR', 'system.MUST_HAVE'];
      const providedParams = manager.parseParameters({
        'env.OTHER_VAR': 'value',
      });

      const validation = manager.validateParameters(providedParams, buildConfig, {
        requiredParameters: requiredParams,
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors).toHaveLength(2);
      expect(validation.missingRequired).toContain('env.REQUIRED_VAR');
      expect(validation.missingRequired).toContain('system.MUST_HAVE');
    });

    it('should validate parameter value formats', async () => {
      const buildConfig: ResolvedBuildConfiguration = {
        id: 'Build1',
        name: 'Test Build',
        projectId: 'Project1',
        projectName: 'Test Project',
        paused: false,
        templateFlag: false,
        allowPersonalBuilds: false,
      };

      const params = manager.parseParameters({
        'build.number': 'not-a-number',
        'system.port': '8080',
        'env.enabled': 'true',
      });

      const validation = manager.validateParameters(params, buildConfig, {
        parameterSchemas: {
          'build.number': { type: 'number' },
          'system.port': { type: 'number', min: 1, max: 65535 },
          'env.enabled': { type: 'boolean' },
        },
      });

      expect(validation.warnings).toContain("Parameter 'build.number' should be a number");
      expect(validation.valid).toBe(true); // Warnings don't fail validation
    });

    it('should validate enum parameters', async () => {
      const buildConfig: ResolvedBuildConfiguration = {
        id: 'Build1',
        name: 'Test Build',
        projectId: 'Project1',
        projectName: 'Test Project',
        paused: false,
        templateFlag: false,
        allowPersonalBuilds: false,
      };

      const params = manager.parseParameters({
        'env.ENVIRONMENT': 'production',
        'deploy.REGION': 'invalid-region',
      });

      const validation = manager.validateParameters(params, buildConfig, {
        parameterSchemas: {
          'env.ENVIRONMENT': {
            type: 'string',
            enum: ['development', 'staging', 'production'],
          },
          'deploy.REGION': {
            type: 'string',
            enum: ['us-east-1', 'us-west-2', 'eu-west-1'],
          },
        },
      });

      expect(validation.warnings).toHaveLength(1);
      expect(validation.warnings[0]).toContain('deploy.REGION');
      expect(validation.warnings[0]).toContain('invalid-region');
    });
  });

  describe('Parameter Inheritance and Overrides', () => {
    it('should merge parameters with build configuration defaults', async () => {
      const buildConfig: ResolvedBuildConfiguration = {
        id: 'Build1',
        name: 'Test Build',
        projectId: 'Project1',
        projectName: 'Test Project',
        paused: false,
        templateFlag: false,
        allowPersonalBuilds: false,
        parameters: {
          'env.DEFAULT_VAR': 'default_value',
          'system.timeout': '30',
          'build.clean': 'true',
        },
      };

      const userParams = manager.parseParameters({
        'env.USER_VAR': 'user_value',
        'system.timeout': '60', // Override default
      });

      const merged = manager.mergeParameters(userParams, buildConfig);

      expect(merged.parameters).toHaveLength(4);
      expect(merged.getParameter('env.DEFAULT_VAR')?.value).toBe('default_value');
      expect(merged.getParameter('env.USER_VAR')?.value).toBe('user_value');
      expect(merged.getParameter('system.timeout')?.value).toBe('60'); // User override
      expect(merged.getParameter('build.clean')?.value).toBe('true');
    });

    it('should handle parameter precedence correctly', async () => {
      const buildConfig: ResolvedBuildConfiguration = {
        id: 'Build1',
        name: 'Test Build',
        projectId: 'Project1',
        projectName: 'Test Project',
        paused: false,
        templateFlag: false,
        allowPersonalBuilds: false,
        parameters: {
          'priority.low': 'config_value',
          'priority.medium': 'config_value',
          'priority.high': 'config_value',
        },
      };

      const templateParams = manager.parseParameters({
        'priority.medium': 'template_value',
        'priority.high': 'template_value',
      });

      const userParams = manager.parseParameters({
        'priority.high': 'user_value',
      });

      const merged = manager.mergeParametersWithPrecedence(userParams, templateParams, buildConfig);

      expect(merged.getParameter('priority.low')?.value).toBe('config_value');
      expect(merged.getParameter('priority.medium')?.value).toBe('template_value');
      expect(merged.getParameter('priority.high')?.value).toBe('user_value');
    });

    it('should detect and report parameter conflicts', async () => {
      const params1 = manager.parseParameters({
        'env.DATABASE_URL': 'postgres://localhost/dev',
        'system.db.host': 'mysql-server',
      });

      const params2 = manager.parseParameters({
        'env.DATABASE_URL': 'mysql://remote/prod',
        'system.db.host': 'postgres-server',
      });

      const conflicts = manager.detectConflicts(params1, params2);

      expect(conflicts).toHaveLength(2);
      expect(conflicts[0]?.parameter).toBe('env.DATABASE_URL');
      expect(conflicts[0]?.values).toContain('postgres://localhost/dev');
      expect(conflicts[0]?.values).toContain('mysql://remote/prod');
    });

    it('should resolve parameter references', async () => {
      const params = manager.parseParameters({
        'base.url': 'https://api.example.com',
        'env.API_ENDPOINT': '%base.url%/v1',
        'system.webhook': '%env.API_ENDPOINT%/hooks',
      });

      const resolved = manager.resolveReferences(params);

      expect(resolved.getParameter('env.API_ENDPOINT')?.value).toBe('https://api.example.com/v1');
      expect(resolved.getParameter('system.webhook')?.value).toBe(
        'https://api.example.com/v1/hooks'
      );
    });

    it('should handle circular parameter references', async () => {
      const params = manager.parseParameters({
        'param.a': '%param.b%',
        'param.b': '%param.c%',
        'param.c': '%param.a%',
      });

      expect(() => {
        manager.resolveReferences(params);
      }).toThrow('Circular reference detected');
    });
  });

  describe('Branch Resolution', () => {
    it('should resolve branch from VCS root', async () => {
      const vcsRootId = 'VcsRoot1';

      mockTeamCityClient.vcsRoots.getVcsRootBranches.mockResolvedValueOnce(
        wrapResponse({
          branch: [
            { name: 'refs/heads/main', default: true },
            { name: 'refs/heads/develop', default: false },
            { name: 'refs/heads/feature/new-feature', default: false },
          ],
        })
      );

      const branch = manager.resolveBranch({
        branchName: 'feature/new-feature',
        vcsRootId,
      });

      expect(branch).toBe('refs/heads/feature/new-feature');
    });

    it('should handle short branch names', async () => {
      const vcsRootId = 'VcsRoot1';

      mockTeamCityClient.vcsRoots.getVcsRootBranches.mockResolvedValueOnce(
        wrapResponse({
          branch: [
            { name: 'refs/heads/main', default: true },
            { name: 'refs/heads/develop', default: false },
          ],
        })
      );

      const branch = manager.resolveBranch({
        branchName: 'develop',
        vcsRootId,
      });

      expect(branch).toBe('refs/heads/develop');
    });

    it('should resolve default branch when not specified', async () => {
      const vcsRootId = 'VcsRoot1';

      mockTeamCityClient.vcsRoots.getVcsRootBranches.mockResolvedValueOnce(
        wrapResponse({
          branch: [
            { name: 'refs/heads/main', default: true },
            { name: 'refs/heads/develop', default: false },
          ],
        })
      );

      const branch = manager.resolveBranch({
        vcsRootId,
        useDefault: true,
      });

      expect(branch).toBe('refs/heads/main');
    });

    it('should handle pull request branches', async () => {
      const vcsRootId = 'VcsRoot1';

      mockTeamCityClient.vcsRoots.getVcsRootBranches.mockResolvedValueOnce(
        wrapResponse({
          branch: [
            { name: 'refs/heads/main', default: true },
            { name: 'refs/pull/123/head', default: false },
            { name: 'refs/pull/123/merge', default: false },
          ],
        })
      );

      const branch = manager.resolveBranch({
        pullRequestNumber: '123',
        vcsRootId,
        preferMergeRef: true,
      });

      expect(branch).toBe('refs/pull/123/merge');
    });

    it('should validate branch exists', async () => {
      const vcsRootId = 'VcsRoot1';

      mockTeamCityClient.vcsRoots.getVcsRootBranches.mockResolvedValueOnce(
        wrapResponse({
          branch: [{ name: 'refs/heads/main', default: true }],
        })
      );

      expect(() => {
        manager.resolveBranch({
          branchName: 'non-existent-branch',
          vcsRootId,
          validateExists: true,
        });
      }).toThrow('Branch not found: non-existent-branch');
    });

    it('should handle tag references', async () => {
      const vcsRootId = 'VcsRoot1';

      mockTeamCityClient.vcsRoots.getVcsRootBranches.mockResolvedValueOnce(
        wrapResponse({
          branch: [
            { name: 'refs/heads/main', default: true },
            { name: 'refs/tags/v1.0.0', default: false },
            { name: 'refs/tags/v1.0.1', default: false },
          ],
        })
      );

      const branch = manager.resolveBranch({
        tagName: 'v1.0.1',
        vcsRootId,
      });

      expect(branch).toBe('refs/tags/v1.0.1');
    });
  });

  describe('Personal Build Handling', () => {
    it('should configure parameters for personal build', async () => {
      const buildConfig: ResolvedBuildConfiguration = {
        id: 'Build1',
        name: 'Test Build',
        projectId: 'Project1',
        projectName: 'Test Project',
        paused: false,
        templateFlag: false,
        allowPersonalBuilds: true,
      };

      const params = manager.parseParameters({
        'env.TEST': 'value',
      });

      const personalOptions: PersonalBuildOptions = {
        isPersonal: true,
        userId: 'user123',
        description: 'Testing my changes',
      };

      const configured = manager.configurePersonalBuild(params, buildConfig, personalOptions);

      expect(configured.getParameter('teamcity.build.personal')?.value).toBe('true');
      expect(configured.getParameter('teamcity.build.triggeredBy')?.value).toBe('user123');
      expect(configured.metadata?.['description']).toBe('Testing my changes');
    });

    it('should reject personal build for unsupported configuration', async () => {
      const buildConfig: ResolvedBuildConfiguration = {
        id: 'Build1',
        name: 'Test Build',
        projectId: 'Project1',
        projectName: 'Test Project',
        paused: false,
        templateFlag: false,
        allowPersonalBuilds: false, // Not allowed
      };

      const params = manager.parseParameters({});

      expect(() => {
        manager.configurePersonalBuild(params, buildConfig, { isPersonal: true });
      }).toThrow('Personal builds are not allowed for this configuration');
    });

    it('should add personal build patches', async () => {
      const buildConfig: ResolvedBuildConfiguration = {
        id: 'Build1',
        name: 'Test Build',
        projectId: 'Project1',
        projectName: 'Test Project',
        paused: false,
        templateFlag: false,
        allowPersonalBuilds: true,
      };

      const params = manager.parseParameters({});

      const personalOptions: PersonalBuildOptions = {
        isPersonal: true,
        patches: [
          { file: 'src/main.ts', content: 'modified content' },
          { file: 'tests/test.ts', content: 'new tests' },
        ],
      };

      const configured = manager.configurePersonalBuild(params, buildConfig, personalOptions);

      expect(configured.metadata?.['patches']).toHaveLength(2);
      const patches = configured.metadata?.['patches'] as Array<{ file: string; content: string }>;
      expect(patches?.[0]?.file).toBe('src/main.ts');
    });
  });

  describe('Parameter Dependencies', () => {
    it('should handle dependent parameters', async () => {
      const params = manager.parseParameters({
        'deploy.enabled': 'true',
        'deploy.server': 'prod-01',
        'test.enabled': 'false',
      });

      const dependencies = {
        'deploy.server': { requires: 'deploy.enabled', value: 'true' },
        'deploy.port': { requires: 'deploy.enabled', value: 'true' },
        'test.suite': { requires: 'test.enabled', value: 'true' },
      };

      const validation = manager.validateDependencies(params, dependencies);

      expect(validation.satisfied).toContain('deploy.server');
      expect(validation.missing).toContain('deploy.port');
      expect(validation.disabled).toContain('test.suite');
    });

    it('should automatically add dependent parameters', async () => {
      const params = manager.parseParameters({
        'ssl.enabled': 'true',
      });

      const dependencies = {
        'ssl.cert_path': {
          requires: 'ssl.enabled',
          value: 'true',
          default: '/etc/ssl/cert.pem',
        },
        'ssl.key_path': {
          requires: 'ssl.enabled',
          value: 'true',
          default: '/etc/ssl/key.pem',
        },
      };

      const enriched = manager.addDependentParameters(params, dependencies);

      expect(enriched.getParameter('ssl.cert_path')?.value).toBe('/etc/ssl/cert.pem');
      expect(enriched.getParameter('ssl.key_path')?.value).toBe('/etc/ssl/key.pem');
    });
  });

  describe('Parameter Serialization', () => {
    it('should serialize parameters for TeamCity API', () => {
      const paramSet = new ParameterSet([
        { name: 'env.VAR1', value: 'value1', type: ParameterType.ENVIRONMENT },
        { name: 'system.prop', value: 'value2', type: ParameterType.SYSTEM },
      ]);

      const serialized = manager.serializeForAPI(paramSet);

      expect(serialized).toEqual({
        property: [
          { name: 'env.VAR1', value: 'value1' },
          { name: 'system.prop', value: 'value2' },
        ],
      });
    });

    it('should serialize parameters to command line format', () => {
      const paramSet = new ParameterSet([
        { name: 'env.NODE_ENV', value: 'production', type: ParameterType.ENVIRONMENT },
        { name: 'build.clean', value: 'true', type: ParameterType.CONFIGURATION },
      ]);

      const cli = manager.serializeToCLI(paramSet);

      expect(cli).toEqual(['-Penv.NODE_ENV=production', '-Pbuild.clean=true']);
    });

    it('should export parameters to environment variables', () => {
      const paramSet = new ParameterSet([
        {
          name: 'env.DATABASE_URL',
          value: 'postgres://localhost',
          type: ParameterType.ENVIRONMENT,
        },
        { name: 'system.debug', value: 'true', type: ParameterType.SYSTEM },
      ]);

      const envVars = manager.exportToEnvironment(paramSet);

      expect(envVars).toEqual({
        DATABASE_URL: 'postgres://localhost',
        SYSTEM_DEBUG: 'true',
      });
    });
  });

  describe('Error Handling', () => {
    it('should throw error for invalid parameter names', () => {
      expect(() => {
        manager.parseParameters({
          'invalid name': 'value',
          '': 'empty name',
          'valid.name': 'ok',
        });
      }).toThrow(ParameterValidationError);
    });

    it('should handle missing required parameters gracefully', async () => {
      const params = manager.parseParameters({});
      const required = ['critical.param1', 'critical.param2'];

      try {
        manager.validateRequiredParameters(params, required, {
          throwOnMissing: true,
        });
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(RequiredParameterError);
        expect((error as RequiredParameterError).missingParameters).toEqual(required);
      }
    });

    it('should provide helpful error messages for conflicts', () => {
      const params1 = manager.parseParameters({
        'db.type': 'postgres',
        'db.driver': 'mysql',
      });

      const params2 = manager.parseParameters({
        'db.type': 'mysql',
        'db.driver': 'postgres',
      });

      try {
        manager.resolveConflicts(params1, params2, { throwOnConflict: true });
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(ParameterConflictError);
        if (error instanceof ParameterConflictError) {
          expect(error.message).toContain('db.type');
          expect(error.message).toContain('db.driver');
        }
      }
    });
  });
});
