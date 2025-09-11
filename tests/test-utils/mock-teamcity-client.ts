/**
 * Type-safe mock utilities for TeamCity client testing
 *
 * Provides properly typed mock implementations that match the real TeamCityClient
 * structure, eliminating the need for dangerous type assertions.
 */
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import type { BuildApi } from '@/teamcity-client/api/build-api';
import type { BuildQueueApi } from '@/teamcity-client/api/build-queue-api';
import type { BuildTypeApi } from '@/teamcity-client/api/build-type-api';
import type { ProjectApi } from '@/teamcity-client/api/project-api';
import type { TestOccurrenceApi } from '@/teamcity-client/api/test-occurrence-api';
import type { VcsRootApi } from '@/teamcity-client/api/vcs-root-api';
import type {
  TeamCityBuildTypeResponse,
  TeamCityProjectResponse,
  TeamCityStepsResponse,
  TeamCityTriggersResponse,
} from '@/teamcity/api-types';
import type { TeamCityClient } from '@/teamcity/client';

/**
 * Mock interface for BuildTypeApi with commonly used methods
 */
export interface MockBuildTypeApi extends Partial<InstanceType<typeof BuildTypeApi>> {
  getAllBuildTypes: jest.Mock;
  getBuildType: jest.Mock;
  createBuildType: jest.Mock;
  updateBuildType: jest.Mock;
  deleteBuildType: jest.Mock;
  setBuildTypeField: jest.Mock;
  deleteBuildParameterOfBuildType: jest.Mock;
}

/**
 * Mock interface for ProjectApi with commonly used methods
 */
export interface MockProjectApi extends Partial<InstanceType<typeof ProjectApi>> {
  getAllProjects: jest.Mock;
  getProject: jest.Mock;
  createProject: jest.Mock;
  updateProject: jest.Mock;
  deleteProject: jest.Mock;
}

/**
 * Mock interface for BuildApi with commonly used methods
 */
export interface MockBuildApi extends Partial<InstanceType<typeof BuildApi>> {
  getAllBuilds: jest.Mock;
  getMultipleBuilds: jest.Mock;
  getBuild: jest.Mock;
  triggerBuild: jest.Mock;
  cancelBuild: jest.Mock;
}

/**
 * Mock interface for BuildQueueApi with commonly used methods
 */
export interface MockBuildQueueApi extends Partial<InstanceType<typeof BuildQueueApi>> {
  addBuildToQueue: jest.Mock;
  getBuildQueue: jest.Mock;
  cancelQueuedBuild: jest.Mock;
}

/**
 * Mock interface for VcsRootApi with commonly used methods
 */
export interface MockVcsRootApi extends Partial<InstanceType<typeof VcsRootApi>> {
  getAllVcsRoots: jest.Mock;
  getVcsRoot: jest.Mock;
}

/**
 * Mock interface for TestOccurrenceApi with commonly used methods
 */
export interface MockTestOccurrenceApi extends Partial<InstanceType<typeof TestOccurrenceApi>> {
  getAllTestOccurrences: jest.Mock;
  getTestOccurrence: jest.Mock;
}

/**
 * Properly typed mock TeamCityClient class that matches the real client structure
 */
export class MockTeamCityClient {
  public buildTypes: MockBuildTypeApi;
  public projects: MockProjectApi;
  public builds: MockBuildApi;
  public buildQueue: MockBuildQueueApi;
  public vcsRoots: MockVcsRootApi;
  public changes: unknown;
  public tests: unknown;
  public testOccurrences: MockTestOccurrenceApi;
  public users: unknown;
  public agents: unknown;
  public agentPools: unknown;

  constructor() {
    // Initialize BuildTypeApi mock
    this.buildTypes = {
      getAllBuildTypes: jest.fn(),
      getBuildType: jest.fn(),
      createBuildType: jest.fn(),
      updateBuildType: jest.fn(),
      deleteBuildType: jest.fn(),
      setBuildTypeField: jest.fn(),
      deleteBuildParameterOfBuildType: jest.fn(),
    } as MockBuildTypeApi;

    // Initialize ProjectApi mock
    this.projects = {
      getAllProjects: jest.fn(),
      getProject: jest.fn(),
      createProject: jest.fn(),
      updateProject: jest.fn(),
      deleteProject: jest.fn(),
    } as MockProjectApi;

    // Initialize BuildApi mock
    this.builds = {
      getAllBuilds: jest.fn(),
      getMultipleBuilds: jest.fn(),
      getBuild: jest.fn(),
      triggerBuild: jest.fn(),
      cancelBuild: jest.fn(),
    } as MockBuildApi;

    // Initialize BuildQueueApi mock
    this.buildQueue = {
      addBuildToQueue: jest.fn(),
      getBuildQueue: jest.fn(),
      cancelQueuedBuild: jest.fn(),
    } as MockBuildQueueApi;

    // Initialize VcsRootApi mock
    this.vcsRoots = {
      getAllVcsRoots: jest.fn(),
      getVcsRoot: jest.fn(),
    } as MockVcsRootApi;

    // Initialize TestOccurrenceApi mock
    this.testOccurrences = {
      getAllTestOccurrences: jest.fn(),
      getTestOccurrence: jest.fn(),
    } as MockTestOccurrenceApi;

    // Initialize other APIs as empty objects (can be extended as needed)
    this.changes = {};
    this.tests = {};
    this.users = {};
    this.agents = {};
    this.agentPools = {};
  }

  /**
   * Mock testConnection method
   */
  async testConnection(): Promise<boolean> {
    return true;
  }

  /**
   * Reset all mock functions
   */
  resetAllMocks(): void {
    Object.values(this).forEach((api) => {
      if (typeof api === 'object' && api !== null) {
        Object.values(api).forEach((method) => {
          if (typeof method === 'function' && 'mockReset' in method) {
            (method as jest.Mock).mockReset();
          }
        });
      }
    });
  }

  /**
   * Clear all mock calls but keep implementations
   */
  clearAllMocks(): void {
    Object.values(this).forEach((api) => {
      if (typeof api === 'object' && api !== null) {
        Object.values(api).forEach((method) => {
          if (typeof method === 'function' && 'mockClear' in method) {
            (method as jest.Mock).mockClear();
          }
        });
      }
    });
  }
}

/**
 * Create a fully typed mock TeamCity client
 * This returns both MockTeamCityClient and TeamCityClient types for flexibility
 */
export function createMockTeamCityClient(): MockTeamCityClient & TeamCityClient {
  return new MockTeamCityClient() as MockTeamCityClient & TeamCityClient;
}

/**
 * Create a type-safe mock Axios instance (kept for backward compatibility)
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
      baseURL: 'http://teamcity.example.com',
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
  // Setup default successful responses
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
 * Helper to setup error responses
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
 * Type assertion helper that validates a mock client has the TeamCityClient shape
 * This provides runtime validation that our mock matches the interface
 */
export function assertIsValidTeamCityClient(client: unknown): asserts client is TeamCityClient {
  const c = client as Record<string, unknown>;

  // Check for required API properties
  const requiredApis = ['buildTypes', 'projects', 'builds', 'buildQueue', 'vcsRoots'] as const;
  for (const api of requiredApis) {
    if (!(api in c)) {
      throw new Error(`Mock client missing required API: ${api}`);
    }
  }

  // Check for required methods on buildTypes
  const buildTypesVal = c['buildTypes'];
  if (typeof buildTypesVal !== 'object' || buildTypesVal === null) {
    throw new Error('Mock client buildTypes must be an object');
  }
  const bt = buildTypesVal as Record<string, unknown>;
  const requiredBuildTypeMethods = ['getAllBuildTypes', 'getBuildType'] as const;
  for (const method of requiredBuildTypeMethods) {
    const m = bt[method];
    if (typeof m !== 'function') {
      throw new Error(`Mock buildTypes missing required method: ${method}`);
    }
  }
}
