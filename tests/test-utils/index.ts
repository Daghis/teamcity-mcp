/**
 * Test Utilities for TeamCity MCP
 *
 * This module re-exports all test utilities for convenient importing.
 *
 * @example
 * ```typescript
 * import {
 *   createMockLogger,
 *   createMockTransport,
 *   createBuildFixture,
 *   createAxiosError,
 * } from 'tests/test-utils';
 * ```
 */

// Logger mocks
export {
  createMockLogger,
  createCapturingMockLogger,
  createMockLoggerModule,
  resetMockLogger,
  asMockTeamCityLogger,
  createWinstonMockLogger,
  resetWinstonMockLogger,
  type MockLogger,
  type WinstonMockLogger,
} from './mock-logger';

// Transport mocks
export {
  createMockTransport,
  createMockStdin,
  createMockStdout,
  createPassThroughStreams,
  createStdioTransportWithMocks,
  injectMockStreams,
  MockTransport,
  type MockStdin,
  type MockStdout,
} from './mock-transport';

// TeamCity client mocks
export {
  createMockTeamCityClient,
  createMockAxiosInstance,
  createMockAxiosResponse,
  createMockTriggerResponse,
  createMockStepsResponse,
  createMockBuildTypeResponse,
  createMockProjectResponse,
  setupCommonMockResponses,
  setupErrorResponse,
  isMockFunction,
  expectApiCall,
  assertIsValidTeamCityClient,
  MockTeamCityClient,
  type MockBuildTypeApi,
  type MockProjectApi,
  type MockBuildApi,
  type MockBuildQueueApi,
  type MockVcsRootApi,
  type MockAgentApi,
  type MockTestOccurrenceApi,
  type MockProblemOccurrenceApi,
  type MockTeamCityModules,
} from './mock-teamcity-client';

// API fixtures
export {
  // Property fixtures
  createPropertyFixture,
  createPropertiesFixture,
  // Project fixtures
  createProjectFixture,
  createProjectsFixture,
  // Build type fixtures
  createBuildTypeFixture,
  createBuildTypesFixture,
  // Build fixtures
  createBuildFixture,
  createBuildsFixture,
  createRunningBuildFixture,
  createQueuedBuildFixture,
  createFailedBuildFixture,
  // Trigger fixtures
  createTriggerFixture,
  createTriggersFixture,
  createVcsTriggerFixture,
  createScheduledTriggerFixture,
  // Step fixtures
  createStepFixture,
  createStepsFixture,
  createCommandLineStepFixture,
  createGradleStepFixture,
  // VCS root fixtures
  createVcsRootEntryFixture,
  createVcsRootEntriesFixture,
  // Agent fixtures
  createAgentFixture,
  createAgentsFixture,
  // Test occurrence fixtures
  createTestOccurrenceFixture,
  createFailedTestFixture,
  createTestOccurrencesFixture,
  // Problem occurrence fixtures
  createProblemOccurrenceFixture,
  createProblemOccurrencesFixture,
  // Utilities
  resetFixtureCounters,
  type DeepPartial,
  type TeamCityAgentFixture,
  type TeamCityTestOccurrenceFixture,
  type TeamCityProblemOccurrenceFixture,
} from './fixtures';

// Error factories
export {
  createAxiosError,
  createAuthenticationError,
  createAuthorizationError,
  createNotFoundError,
  createValidationError,
  createConflictError,
  createRateLimitError,
  createServerError,
  createBadGatewayError,
  createServiceUnavailableError,
  createTimeoutError,
  createNetworkError,
  createHttpError,
  createTeamCityApiError,
  type AxiosErrorOptions,
  type HttpError,
} from './errors';
