/**
 * Type-safe mock utilities for TeamCity client testing
 *
 * Provides properly typed mock implementations that match the TeamCityUnifiedClient
 * surface so managers can be tested without dangerous casts.
 */
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import type {
  TeamCityBuildTypeResponse,
  TeamCityProjectResponse,
  TeamCityStepsResponse,
  TeamCityTriggersResponse,
} from '@/teamcity/api-types';
import type {
  TeamCityApiSurface,
  TeamCityRequestContext,
  TeamCityUnifiedClient,
} from '@/teamcity/types/client';

/**
 * Mock interface for BuildType API methods used in tests
 */
export interface MockBuildTypeApi {
  getAllBuildTypes: jest.Mock;
  getBuildType: jest.Mock;
  createBuildType: jest.Mock;
  updateBuildType: jest.Mock;
  deleteBuildType: jest.Mock;
  setBuildTypeField: jest.Mock;
  deleteBuildParameterOfBuildType: jest.Mock;
  deleteBuildParameterOfBuildType_2: jest.Mock;
}

/**
 * Mock interface for Project API methods used in tests
 */
export interface MockProjectApi {
  getAllProjects: jest.Mock;
  getProject: jest.Mock;
  getAllSubprojectsOrdered: jest.Mock;
  createProject: jest.Mock;
  updateProject: jest.Mock;
  deleteProject: jest.Mock;
}

/**
 * Mock interface for Build API methods used in tests
 */
export interface MockBuildApi {
  getAllBuilds: jest.Mock;
  getMultipleBuilds: jest.Mock;
  getBuild: jest.Mock;
  triggerBuild: jest.Mock;
  cancelBuild: jest.Mock;
}

/**
 * Mock interface for VcsRoot API methods used in tests
 */
export interface MockVcsRootApi {
  getAllVcsRoots: jest.Mock;
  addVcsRoot: jest.Mock;
  getVcsRoot: jest.Mock;
  getVcsRootInstances: jest.Mock;
  getVcsRootBranches: jest.Mock;
}

/**
 * Subset of modules that we actively mock for manager tests.
 */
export interface MockTeamCityModules {
  buildTypes: MockBuildTypeApi;
  projects: MockProjectApi;
  builds: MockBuildApi;
  vcsRoots: MockVcsRootApi;
}

const DEFAULT_BASE_URL = 'https://teamcity.test.local';
const DEFAULT_TOKEN = 'mock-token';

const createEmptyModules = (): TeamCityApiSurface => ({
  agents: {} as TeamCityApiSurface['agents'],
  agentPools: {} as TeamCityApiSurface['agentPools'],
  agentTypes: {} as TeamCityApiSurface['agentTypes'],
  audit: {} as TeamCityApiSurface['audit'],
  avatars: {} as TeamCityApiSurface['avatars'],
  builds: {} as TeamCityApiSurface['builds'],
  buildQueue: {} as TeamCityApiSurface['buildQueue'],
  buildTypes: {} as TeamCityApiSurface['buildTypes'],
  changes: {} as TeamCityApiSurface['changes'],
  cloudInstances: {} as TeamCityApiSurface['cloudInstances'],
  deploymentDashboards: {} as TeamCityApiSurface['deploymentDashboards'],
  globalServerSettings: {} as TeamCityApiSurface['globalServerSettings'],
  groups: {} as TeamCityApiSurface['groups'],
  health: {} as TeamCityApiSurface['health'],
  investigations: {} as TeamCityApiSurface['investigations'],
  mutes: {} as TeamCityApiSurface['mutes'],
  nodes: {} as TeamCityApiSurface['nodes'],
  problems: {} as TeamCityApiSurface['problems'],
  problemOccurrences: {} as TeamCityApiSurface['problemOccurrences'],
  projects: {} as TeamCityApiSurface['projects'],
  roles: {} as TeamCityApiSurface['roles'],
  root: {} as TeamCityApiSurface['root'],
  server: {} as TeamCityApiSurface['server'],
  serverAuthSettings: {} as TeamCityApiSurface['serverAuthSettings'],
  tests: {} as TeamCityApiSurface['tests'],
  testMetadata: {} as TeamCityApiSurface['testMetadata'],
  users: {} as TeamCityApiSurface['users'],
  vcsRoots: {} as TeamCityApiSurface['vcsRoots'],
  vcsRootInstances: {} as TeamCityApiSurface['vcsRootInstances'],
  versionedSettings: {} as TeamCityApiSurface['versionedSettings'],
});

/**
 * Properly typed mock TeamCity client that implements the unified client surface.
 */
export class MockTeamCityClient implements TeamCityUnifiedClient {
  public readonly modules: Readonly<TeamCityApiSurface>;
  public readonly http: AxiosInstance;
  public readonly request: jest.MockedFunction<TeamCityUnifiedClient['request']>;
  public readonly getConfig: jest.Mock<ReturnType<TeamCityUnifiedClient['getConfig']>, []>;
  public readonly getApiConfig: jest.Mock<ReturnType<TeamCityUnifiedClient['getApiConfig']>, []>;
  public readonly getAxios: jest.Mock<ReturnType<TeamCityUnifiedClient['getAxios']>, []>;
  public readonly mockModules: MockTeamCityModules;

  constructor(overrides?: Partial<MockTeamCityModules>) {
    this.mockModules = {
      buildTypes: {
        getAllBuildTypes: jest.fn(),
        getBuildType: jest.fn(),
        createBuildType: jest.fn(),
        updateBuildType: jest.fn(),
        deleteBuildType: jest.fn(),
        setBuildTypeField: jest.fn(),
        deleteBuildParameterOfBuildType: jest.fn(),
        deleteBuildParameterOfBuildType_2: jest.fn(),
      },
      projects: {
        getAllProjects: jest.fn(),
        getProject: jest.fn(),
        getAllSubprojectsOrdered: jest.fn(),
        createProject: jest.fn(),
        updateProject: jest.fn(),
        deleteProject: jest.fn(),
      },
      builds: {
        getAllBuilds: jest.fn(),
        getMultipleBuilds: jest.fn(),
        getBuild: jest.fn(),
        triggerBuild: jest.fn(),
        cancelBuild: jest.fn(),
      },
      vcsRoots: {
        getAllVcsRoots: jest.fn(),
        addVcsRoot: jest.fn(),
        getVcsRoot: jest.fn(),
        getVcsRootInstances: jest.fn(),
        getVcsRootBranches: jest.fn(),
      },
      ...overrides,
    } as MockTeamCityModules;

    const modules = createEmptyModules();
    modules.buildTypes = this.mockModules.buildTypes as unknown as TeamCityApiSurface['buildTypes'];
    modules.projects = this.mockModules.projects as unknown as TeamCityApiSurface['projects'];
    modules.builds = this.mockModules.builds as unknown as TeamCityApiSurface['builds'];
    modules.vcsRoots = this.mockModules.vcsRoots as unknown as TeamCityApiSurface['vcsRoots'];

    this.modules = Object.freeze(modules);

    this.http = createMockAxiosInstance();
    this.request = jest.fn(async (fn: (ctx: TeamCityRequestContext) => Promise<unknown>) =>
      fn({ axios: this.http, baseUrl: DEFAULT_BASE_URL })
    ) as jest.MockedFunction<TeamCityUnifiedClient['request']>;
    this.getConfig = jest.fn(() => ({
      connection: {
        baseUrl: DEFAULT_BASE_URL,
        token: DEFAULT_TOKEN,
        timeout: undefined,
      },
    })) as jest.Mock;
    this.getApiConfig = jest.fn(() => ({
      baseUrl: DEFAULT_BASE_URL,
      token: DEFAULT_TOKEN,
      timeout: undefined,
    })) as jest.Mock;
    this.getAxios = jest.fn(() => this.http) as jest.Mock;
  }

  /**
   * Convenience getter matching the legacy mock structure.
   */
  get buildTypes(): MockBuildTypeApi {
    return this.mockModules.buildTypes;
  }

  get projects(): MockProjectApi {
    return this.mockModules.projects;
  }

  get builds(): MockBuildApi {
    return this.mockModules.builds;
  }

  get vcsRoots(): MockVcsRootApi {
    return this.mockModules.vcsRoots;
  }

  /**
   * Mock connectivity check retained for compatibility.
   */
  async testConnection(): Promise<boolean> {
    return true;
  }

  /**
   * Reset all mock implementations and call counts.
   */
  resetAllMocks(): void {
    for (const api of Object.values(this.mockModules)) {
      Object.values(api).forEach((method) => {
        if (typeof method === 'function' && 'mockReset' in method) {
          (method as jest.Mock).mockReset();
        }
      });
    }

    this.request.mockReset();
    this.getConfig.mockReset();
    this.getApiConfig.mockReset();
    this.getAxios.mockReset();
  }

  /**
   * Clear mock call history while retaining implementations.
   */
  clearAllMocks(): void {
    for (const api of Object.values(this.mockModules)) {
      Object.values(api).forEach((method) => {
        if (typeof method === 'function' && 'mockClear' in method) {
          (method as jest.Mock).mockClear();
        }
      });
    }

    this.request.mockClear();
    this.getConfig.mockClear();
    this.getApiConfig.mockClear();
    this.getAxios.mockClear();
  }
}

/**
 * Create a fully typed mock TeamCity unified client.
 */
export function createMockTeamCityClient(): MockTeamCityClient & TeamCityUnifiedClient {
  return new MockTeamCityClient() as MockTeamCityClient & TeamCityUnifiedClient;
}

/**
 * Create a type-safe mock Axios instance (kept for compatibility)
 */
export function createMockAxiosInstance(): jest.Mocked<AxiosInstance> {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    head: jest.fn(),
    options: jest.fn(),
    request: jest.fn(),
    getUri: jest.fn(),
    defaults: {
      headers: {
        common: {},
        delete: {},
        get: {},
        head: {},
        post: {},
        put: {},
        patch: {},
      },
      baseURL: DEFAULT_BASE_URL,
      timeout: 30000,
      transformRequest: [],
      transformResponse: [],
      validateStatus: jest.fn(),
    },
    interceptors: {
      request: {
        use: jest.fn(),
        eject: jest.fn(),
        clear: jest.fn(),
      },
      response: {
        use: jest.fn(),
        eject: jest.fn(),
        clear: jest.fn(),
      },
    },
  } as unknown as jest.Mocked<AxiosInstance>;
}

/**
 * Create a mock Axios response with proper typing
 */
export function createMockAxiosResponse<T>(data: T, status = 200): AxiosResponse<T> {
  return {
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: {} as InternalAxiosRequestConfig,
  };
}

/**
 * Type-safe mock factory for build triggers
 */
export function createMockTriggerResponse(
  overrides?: Partial<TeamCityTriggersResponse>
): TeamCityTriggersResponse {
  return {
    count: 0,
    trigger: [],
    ...overrides,
  };
}

/**
 * Type-safe mock factory for build steps
 */
export function createMockStepsResponse(
  overrides?: Partial<TeamCityStepsResponse>
): TeamCityStepsResponse {
  return {
    count: 0,
    step: [],
    ...overrides,
  };
}

/**
 * Type-safe mock factory for build types
 */
export function createMockBuildTypeResponse(
  overrides?: Partial<TeamCityBuildTypeResponse>
): TeamCityBuildTypeResponse {
  return {
    id: 'MockProject_Build',
    name: 'Mock Build',
    projectId: 'MockProject',
    ...overrides,
  };
}

/**
 * Type-safe mock factory for projects
 */
export function createMockProjectResponse(
  overrides?: Partial<TeamCityProjectResponse>
): TeamCityProjectResponse {
  return {
    id: 'MockProject',
    name: 'Mock Project',
    ...overrides,
  };
}

/**
 * Helper to setup common mock responses
 */
export function setupCommonMockResponses(mockClient: MockTeamCityClient): void {
  mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(
    createMockAxiosResponse({
      count: 0,
      buildType: [],
    })
  );

  mockClient.projects.getAllProjects.mockResolvedValue(
    createMockAxiosResponse({
      count: 0,
      project: [],
    })
  );

  mockClient.builds.getAllBuilds.mockResolvedValue(
    createMockAxiosResponse({
      count: 0,
      build: [],
    })
  );
}

/**
 * Helper to setup error responses on a given mock function
 */
export function setupErrorResponse(mockFn: jest.Mock, status: number, message = 'API Error'): void {
  mockFn.mockRejectedValue({
    response: {
      status,
      data: { message },
    },
  });
}

/**
 * Type guard for checking if a value is a mock function
 */
export function isMockFunction<T extends (...args: never[]) => unknown>(
  fn: T | jest.MockedFunction<T>
): fn is jest.MockedFunction<T> {
  return 'mockClear' in fn && typeof fn.mockClear === 'function';
}

/**
 * Assertion helper for verifying API calls
 */
export function expectApiCall(
  mockFn: jest.Mock,
  expectedPath: string,
  expectedParams?: Record<string, unknown>
): void {
  expect(mockFn).toHaveBeenCalledWith(
    expectedPath,
    expectedParams ? expect.objectContaining({ params: expectedParams }) : undefined
  );
}

/**
 * Runtime assertion to validate the unified client mock shape
 */
export function assertIsValidTeamCityClient(
  client: unknown
): asserts client is TeamCityUnifiedClient {
  if (client == null || typeof client !== 'object') {
    throw new Error('Mock client must be an object');
  }

  const typed = client as TeamCityUnifiedClient;

  if (typed.modules == null || typeof typed.modules !== 'object') {
    throw new Error('Mock client must expose modules');
  }

  const requiredModules = ['buildTypes', 'projects', 'builds', 'vcsRoots'] as const;
  for (const moduleName of requiredModules) {
    if (typed.modules[moduleName] == null) {
      throw new Error(`Mock client missing required module: ${moduleName}`);
    }
  }
}
