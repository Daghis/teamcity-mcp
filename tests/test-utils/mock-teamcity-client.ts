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
  BuildApiLike,
  TeamCityApiSurface,
  TeamCityBuildLogChunk,
  TeamCityClientAdapter,
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
  getAllBuildSteps: jest.Mock;
  addBuildStepToBuildType: jest.Mock;
  replaceBuildStep: jest.Mock;
  deleteBuildStep: jest.Mock;
  replaceAllBuildSteps: jest.Mock;
  getAllTriggers: jest.Mock;
  addTriggerToBuildType: jest.Mock;
  getTrigger: jest.Mock;
  replaceTrigger: jest.Mock;
  deleteTrigger: jest.Mock;
  getAllVcsRootsOfBuildType: jest.Mock;
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
  getBuildProblems: jest.Mock;
  triggerBuild: jest.Mock;
  cancelBuild: jest.Mock;
  getFilesListOfBuild: jest.Mock;
  getFileMetadataOfBuild: jest.Mock;
  downloadFileOfBuild: jest.Mock;
}

/**
 * Mock interface for BuildQueue API methods used in tests
 */
export interface MockBuildQueueApi {
  addBuildToQueue: jest.Mock;
  getAllQueuedBuilds: jest.Mock;
  setQueuedBuildsOrder: jest.Mock;
  cancelQueuedBuild: jest.Mock;
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
 * Mock interface for Agent API methods used in tests
 */
export interface MockAgentApi {
  getAllAgents: jest.Mock;
}

export interface MockTestOccurrenceApi {
  getAllTestOccurrences: jest.Mock;
  getTestOccurrence: jest.Mock;
}

export interface MockProblemOccurrenceApi {
  getAllBuildProblemOccurrences: jest.Mock;
  getBuildProblemOccurrence: jest.Mock;
}

/**
 * Subset of modules that we actively mock for manager tests.
 */
export interface MockTeamCityModules {
  buildTypes: MockBuildTypeApi;
  projects: MockProjectApi;
  builds: MockBuildApi;
  buildQueue: MockBuildQueueApi;
  vcsRoots: MockVcsRootApi;
  agents: MockAgentApi;
  tests: MockTestOccurrenceApi;
  problemOccurrences: MockProblemOccurrenceApi;
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
export class MockTeamCityClient implements TeamCityClientAdapter {
  public readonly modules: Readonly<TeamCityApiSurface>;
  public readonly http: AxiosInstance;
  public readonly request: jest.MockedFunction<TeamCityUnifiedClient['request']>;
  public readonly getConfig: jest.Mock<ReturnType<TeamCityUnifiedClient['getConfig']>, []>;
  public readonly getApiConfig: jest.Mock<ReturnType<TeamCityUnifiedClient['getApiConfig']>, []>;
  public readonly getAxios: jest.Mock<ReturnType<TeamCityUnifiedClient['getAxios']>, []>;
  public readonly mockModules: MockTeamCityModules;
  public readonly baseUrl: string;
  public readonly builds: MockBuildApi & BuildApiLike;
  public readonly listProjects: jest.Mock;
  public readonly getProject: jest.Mock;
  public readonly listBuilds: jest.Mock;
  public readonly getBuild: jest.Mock;
  public readonly triggerBuild: jest.Mock;
  public readonly getBuildLog: jest.Mock;
  public readonly getBuildLogChunk: jest.Mock<
    Promise<TeamCityBuildLogChunk>,
    [string, { startLine?: number; lineCount?: number }?]
  >;
  public readonly listBuildTypes: jest.Mock;
  public readonly getBuildType: jest.Mock;
  public readonly listTestFailures: jest.Mock;
  public readonly listBuildArtifacts: jest.Mock;
  public readonly downloadArtifactContent: jest.MockedFunction<
    TeamCityClientAdapter['downloadArtifactContent']
  >;
  public readonly getBuildStatistics: jest.Mock;
  public readonly listChangesForBuild: jest.Mock;
  public readonly listSnapshotDependencies: jest.Mock;
  public readonly listVcsRoots: jest.Mock;
  public readonly listAgents: jest.Mock;
  public readonly listAgentPools: jest.Mock;
  private readonly adapterMockFns: Array<{ mockReset: () => void; mockClear: () => void }>;

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
        getAllBuildSteps: jest.fn(),
        addBuildStepToBuildType: jest.fn(),
        replaceBuildStep: jest.fn(),
        deleteBuildStep: jest.fn(),
        replaceAllBuildSteps: jest.fn(),
        getAllTriggers: jest.fn(),
        addTriggerToBuildType: jest.fn(),
        getTrigger: jest.fn(),
        replaceTrigger: jest.fn(),
        deleteTrigger: jest.fn(),
        getAllVcsRootsOfBuildType: jest.fn(),
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
        getBuildProblems: jest.fn(),
        triggerBuild: jest.fn(),
        cancelBuild: jest.fn(),
        getFilesListOfBuild: jest.fn(),
        getFileMetadataOfBuild: jest.fn(),
        downloadFileOfBuild: jest.fn(),
      },
      buildQueue: {
        addBuildToQueue: jest.fn(),
        getAllQueuedBuilds: jest.fn(),
        setQueuedBuildsOrder: jest.fn(),
        cancelQueuedBuild: jest.fn(),
      },
      vcsRoots: {
        getAllVcsRoots: jest.fn(),
        addVcsRoot: jest.fn(),
        getVcsRoot: jest.fn(),
        getVcsRootInstances: jest.fn(),
        getVcsRootBranches: jest.fn(),
      },
      agents: {
        getAllAgents: jest.fn(),
      },
      tests: {
        getAllTestOccurrences: jest.fn(),
        getTestOccurrence: jest.fn(),
      },
      problemOccurrences: {
        getAllBuildProblemOccurrences: jest.fn(),
        getBuildProblemOccurrence: jest.fn(),
      },
      ...overrides,
    } as MockTeamCityModules;

    const modules = createEmptyModules();
    modules.buildTypes = this.mockModules.buildTypes as unknown as TeamCityApiSurface['buildTypes'];
    modules.projects = this.mockModules.projects as unknown as TeamCityApiSurface['projects'];
    modules.builds = this.mockModules.builds as unknown as TeamCityApiSurface['builds'];
    modules.buildQueue = this.mockModules.buildQueue as unknown as TeamCityApiSurface['buildQueue'];
    modules.vcsRoots = this.mockModules.vcsRoots as unknown as TeamCityApiSurface['vcsRoots'];
    modules.agents = this.mockModules.agents as unknown as TeamCityApiSurface['agents'];
    modules.tests = this.mockModules.tests as unknown as TeamCityApiSurface['tests'];
    modules.problemOccurrences = this.mockModules
      .problemOccurrences as unknown as TeamCityApiSurface['problemOccurrences'];

    this.modules = Object.freeze(modules);

    this.baseUrl = DEFAULT_BASE_URL;
    this.listProjects = jest.fn();
    this.getProject = jest.fn();
    this.listBuilds = jest.fn();
    this.getBuild = jest.fn();
    this.triggerBuild = jest.fn();
    this.getBuildLog = jest.fn();
    this.getBuildLogChunk = jest.fn();
    this.listBuildTypes = jest.fn();
    this.getBuildType = jest.fn();
    this.listTestFailures = jest.fn();
    this.listBuildArtifacts = jest.fn();
    this.downloadArtifactContent = jest.fn() as jest.MockedFunction<
      TeamCityClientAdapter['downloadArtifactContent']
    >;
    this.getBuildStatistics = jest.fn();
    this.listChangesForBuild = jest.fn();
    this.listSnapshotDependencies = jest.fn();
    this.listVcsRoots = jest.fn();
    this.listAgents = jest.fn();
    this.listAgentPools = jest.fn();
    this.builds = this.mockModules.builds as unknown as MockBuildApi & BuildApiLike;

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
    this.adapterMockFns = [
      this.listProjects,
      this.getProject,
      this.listBuilds,
      this.getBuild,
      this.triggerBuild,
      this.getBuildLog,
      this.getBuildLogChunk as unknown as jest.Mock,
      this.listBuildTypes,
      this.getBuildType,
      this.listTestFailures,
      this.listBuildArtifacts,
      this.downloadArtifactContent,
      this.getBuildStatistics,
      this.listChangesForBuild,
      this.listSnapshotDependencies,
      this.listVcsRoots,
      this.listAgents,
      this.listAgentPools,
    ];
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

  get vcsRoots(): MockVcsRootApi {
    return this.mockModules.vcsRoots;
  }

  get buildQueue(): MockBuildQueueApi {
    return this.mockModules.buildQueue;
  }

  get agents(): MockAgentApi {
    return this.mockModules.agents;
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
    this.adapterMockFns.forEach((fn) => fn.mockReset());
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
    this.adapterMockFns.forEach((fn) => fn.mockClear());
  }
}

/**
 * Create a fully typed mock TeamCity unified client.
 */
export function createMockTeamCityClient(): MockTeamCityClient & TeamCityClientAdapter {
  return new MockTeamCityClient() as MockTeamCityClient & TeamCityClientAdapter;
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
