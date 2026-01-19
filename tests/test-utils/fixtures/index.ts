/**
 * Type-safe fixture builders for TeamCity API testing
 *
 * Provides properly typed factory functions that create valid API response
 * objects without requiring `as unknown as` casts.
 *
 * @example
 * ```typescript
 * const project = createProjectFixture({ name: 'My Project' });
 * const build = createBuildFixture({ status: 'FAILURE' });
 * ```
 */
import type {
  TeamCityBuildResponse,
  TeamCityBuildTypeResponse,
  TeamCityBuildTypesResponse,
  TeamCityBuildsResponse,
  TeamCityProjectResponse,
  TeamCityProjectsResponse,
  TeamCityProperties,
  TeamCityProperty,
  TeamCityStepResponse,
  TeamCityStepsResponse,
  TeamCityTriggerResponse,
  TeamCityTriggersResponse,
  TeamCityVcsRootEntriesResponse,
  TeamCityVcsRootEntry,
} from '@/teamcity/api-types';

/**
 * Deep partial type for nested object overrides
 */
export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

// ============================================================================
// Property Fixtures
// ============================================================================

/**
 * Create a TeamCity property
 */
export function createPropertyFixture(overrides: Partial<TeamCityProperty> = {}): TeamCityProperty {
  return {
    name: 'property-name',
    value: 'property-value',
    ...overrides,
  };
}

/**
 * Create a TeamCity properties collection
 */
export function createPropertiesFixture(properties: TeamCityProperty[] = []): TeamCityProperties {
  return {
    count: properties.length,
    property: properties.length === 0 ? undefined : properties,
  };
}

// ============================================================================
// Project Fixtures
// ============================================================================

let projectCounter = 0;

/**
 * Create a TeamCity project response
 *
 * @example
 * ```typescript
 * const project = createProjectFixture();
 * // { id: 'TestProject_1', name: 'Test Project 1', ... }
 *
 * const customProject = createProjectFixture({
 *   id: 'MyProject',
 *   name: 'My Custom Project',
 *   archived: true,
 * });
 * ```
 */
export function createProjectFixture(
  overrides: DeepPartial<TeamCityProjectResponse> = {}
): TeamCityProjectResponse {
  projectCounter++;
  const id = overrides.id ?? `TestProject_${projectCounter}`;
  const name = overrides.name ?? `Test Project ${projectCounter}`;

  return {
    id,
    name,
    parentProjectId: '_Root',
    href: `/app/rest/projects/id:${id}`,
    webUrl: `https://teamcity.example.com/project/${id}`,
    ...overrides,
  } as TeamCityProjectResponse;
}

/**
 * Create a TeamCity projects collection response
 */
export function createProjectsFixture(
  projects: TeamCityProjectResponse[] = []
): TeamCityProjectsResponse {
  return {
    count: projects.length,
    project: projects.length === 0 ? undefined : projects,
  };
}

// ============================================================================
// Build Type Fixtures
// ============================================================================

let buildTypeCounter = 0;

/**
 * Create a TeamCity build type (configuration) response
 *
 * @example
 * ```typescript
 * const buildType = createBuildTypeFixture();
 * // { id: 'TestProject_Build_1', name: 'Build 1', projectId: 'TestProject', ... }
 *
 * const customBuildType = createBuildTypeFixture({
 *   id: 'MyProject_Deploy',
 *   name: 'Deploy to Production',
 *   paused: true,
 * });
 * ```
 */
export function createBuildTypeFixture(
  overrides: DeepPartial<TeamCityBuildTypeResponse> = {}
): TeamCityBuildTypeResponse {
  buildTypeCounter++;
  const projectId = overrides.projectId ?? 'TestProject';
  const id = overrides.id ?? `${projectId}_Build_${buildTypeCounter}`;
  const name = overrides.name ?? `Build ${buildTypeCounter}`;

  return {
    id,
    name,
    projectId,
    projectName: overrides.projectName ?? 'Test Project',
    webUrl: `https://teamcity.example.com/buildConfiguration/${id}`,
    paused: false,
    ...overrides,
  } as TeamCityBuildTypeResponse;
}

/**
 * Create a TeamCity build types collection response
 */
export function createBuildTypesFixture(
  buildTypes: TeamCityBuildTypeResponse[] = []
): TeamCityBuildTypesResponse {
  return {
    count: buildTypes.length,
    buildType: buildTypes.length === 0 ? undefined : buildTypes,
  };
}

// ============================================================================
// Build Fixtures
// ============================================================================

let buildCounter = 0;

/**
 * Create a TeamCity build response
 *
 * @example
 * ```typescript
 * const build = createBuildFixture();
 * // { id: 1, buildTypeId: 'TestProject_Build', status: 'SUCCESS', state: 'finished', ... }
 *
 * const failedBuild = createBuildFixture({
 *   status: 'FAILURE',
 *   statusText: 'Tests failed',
 * });
 *
 * const runningBuild = createBuildFixture({
 *   state: 'running',
 *   percentageComplete: 45,
 * });
 * ```
 */
export function createBuildFixture(
  overrides: DeepPartial<TeamCityBuildResponse> = {}
): TeamCityBuildResponse {
  buildCounter++;
  const id = overrides.id ?? buildCounter;
  const buildTypeId = overrides.buildTypeId ?? 'TestProject_Build';

  return {
    id,
    buildTypeId,
    number: overrides.number ?? `${id}`,
    status: 'SUCCESS',
    state: 'finished',
    branchName: 'main',
    defaultBranch: true,
    href: `/app/rest/builds/id:${id}`,
    webUrl: `https://teamcity.example.com/viewLog.html?buildId=${id}`,
    ...overrides,
  } as TeamCityBuildResponse;
}

/**
 * Create a TeamCity builds collection response
 */
export function createBuildsFixture(builds: TeamCityBuildResponse[] = []): TeamCityBuildsResponse {
  return {
    count: builds.length,
    build: builds.length === 0 ? undefined : builds,
  };
}

/**
 * Create a running build fixture
 */
export function createRunningBuildFixture(
  overrides: DeepPartial<TeamCityBuildResponse> = {}
): TeamCityBuildResponse {
  return createBuildFixture({
    state: 'running',
    running: true,
    percentageComplete: overrides.percentageComplete ?? 50,
    status: undefined, // Running builds don't have final status yet
    ...overrides,
  });
}

/**
 * Create a queued build fixture
 */
export function createQueuedBuildFixture(
  overrides: DeepPartial<TeamCityBuildResponse> = {}
): TeamCityBuildResponse {
  return createBuildFixture({
    state: 'queued',
    status: undefined,
    queuedDate: new Date().toISOString(),
    ...overrides,
  });
}

/**
 * Create a failed build fixture
 */
export function createFailedBuildFixture(
  overrides: DeepPartial<TeamCityBuildResponse> = {}
): TeamCityBuildResponse {
  return createBuildFixture({
    status: 'FAILURE',
    statusText: overrides.statusText ?? 'Tests failed: 3 tests',
    ...overrides,
  });
}

// ============================================================================
// Trigger Fixtures
// ============================================================================

let triggerCounter = 0;

/**
 * Create a TeamCity trigger response
 */
export function createTriggerFixture(
  overrides: DeepPartial<TeamCityTriggerResponse> = {}
): TeamCityTriggerResponse {
  triggerCounter++;
  return {
    id: overrides.id ?? `TRIGGER_${triggerCounter}`,
    type: overrides.type ?? 'vcsTrigger',
    disabled: false,
    inherited: false,
    ...overrides,
  } as TeamCityTriggerResponse;
}

/**
 * Create a TeamCity triggers collection response
 */
export function createTriggersFixture(
  triggers: TeamCityTriggerResponse[] = []
): TeamCityTriggersResponse {
  return {
    count: triggers.length,
    trigger: triggers.length === 0 ? undefined : triggers,
  };
}

/**
 * Create a VCS trigger fixture
 */
export function createVcsTriggerFixture(
  overrides: DeepPartial<TeamCityTriggerResponse> = {}
): TeamCityTriggerResponse {
  return createTriggerFixture({
    type: 'vcsTrigger',
    properties: createPropertiesFixture([
      createPropertyFixture({ name: 'quietPeriodMode', value: 'DO_NOT_USE' }),
    ]),
    ...overrides,
  });
}

/**
 * Create a scheduled trigger fixture
 */
export function createScheduledTriggerFixture(
  overrides: DeepPartial<TeamCityTriggerResponse> = {}
): TeamCityTriggerResponse {
  return createTriggerFixture({
    type: 'schedulingTrigger',
    properties: createPropertiesFixture([
      createPropertyFixture({ name: 'schedulingPolicy', value: 'daily' }),
      createPropertyFixture({ name: 'hour', value: '3' }),
      createPropertyFixture({ name: 'minute', value: '0' }),
    ]),
    ...overrides,
  });
}

// ============================================================================
// Step Fixtures
// ============================================================================

let stepCounter = 0;

/**
 * Create a TeamCity step response
 */
export function createStepFixture(
  overrides: DeepPartial<TeamCityStepResponse> = {}
): TeamCityStepResponse {
  stepCounter++;
  return {
    id: overrides.id ?? `STEP_${stepCounter}`,
    name: overrides.name ?? `Step ${stepCounter}`,
    type: overrides.type ?? 'simpleRunner',
    disabled: false,
    inherited: false,
    ...overrides,
  } as TeamCityStepResponse;
}

/**
 * Create a TeamCity steps collection response
 */
export function createStepsFixture(steps: TeamCityStepResponse[] = []): TeamCityStepsResponse {
  return {
    count: steps.length,
    step: steps.length === 0 ? undefined : steps,
  };
}

/**
 * Create a command line step fixture
 */
export function createCommandLineStepFixture(
  command: string,
  overrides: DeepPartial<TeamCityStepResponse> = {}
): TeamCityStepResponse {
  return createStepFixture({
    type: 'simpleRunner',
    properties: createPropertiesFixture([
      createPropertyFixture({ name: 'script.content', value: command }),
      createPropertyFixture({ name: 'use.custom.script', value: 'true' }),
    ]),
    ...overrides,
  });
}

/**
 * Create a Gradle step fixture
 */
export function createGradleStepFixture(
  tasks: string = 'build',
  overrides: DeepPartial<TeamCityStepResponse> = {}
): TeamCityStepResponse {
  return createStepFixture({
    type: 'gradle-runner',
    properties: createPropertiesFixture([
      createPropertyFixture({ name: 'ui.gradleRunner.gradle.tasks.names', value: tasks }),
    ]),
    ...overrides,
  });
}

// ============================================================================
// VCS Root Fixtures
// ============================================================================

let vcsRootCounter = 0;

/**
 * Create a TeamCity VCS root entry
 */
export function createVcsRootEntryFixture(
  overrides: DeepPartial<TeamCityVcsRootEntry> = {}
): TeamCityVcsRootEntry {
  vcsRootCounter++;
  const id = overrides.id ?? `VcsRoot_${vcsRootCounter}`;

  return {
    id,
    inherited: false,
    'checkout-rules': '+:.',
    'vcs-root': {
      id,
      name: `VCS Root ${vcsRootCounter}`,
      href: `/app/rest/vcs-roots/id:${id}`,
      ...(overrides['vcs-root'] ?? {}),
    },
    ...overrides,
  } as TeamCityVcsRootEntry;
}

/**
 * Create a TeamCity VCS root entries collection response
 */
export function createVcsRootEntriesFixture(
  entries: TeamCityVcsRootEntry[] = []
): TeamCityVcsRootEntriesResponse {
  return {
    count: entries.length,
    'vcs-root-entry': entries.length === 0 ? undefined : entries,
  };
}

// ============================================================================
// Agent Fixtures
// ============================================================================

/**
 * TeamCity agent response (simplified for testing)
 */
export interface TeamCityAgentFixture {
  id: number;
  name: string;
  typeId?: number;
  connected?: boolean;
  enabled?: boolean;
  authorized?: boolean;
  uptodate?: boolean;
  ip?: string;
  pool?: {
    id: number;
    name: string;
    href?: string;
  };
}

let agentCounter = 0;

/**
 * Create a TeamCity agent fixture
 */
export function createAgentFixture(
  overrides: Partial<TeamCityAgentFixture> = {}
): TeamCityAgentFixture {
  agentCounter++;
  return {
    id: overrides.id ?? agentCounter,
    name: overrides.name ?? `Agent ${agentCounter}`,
    typeId: overrides.typeId ?? 1,
    connected: overrides.connected ?? true,
    enabled: overrides.enabled ?? true,
    authorized: overrides.authorized ?? true,
    uptodate: overrides.uptodate ?? true,
    ip: overrides.ip ?? '192.168.1.100',
    pool: overrides.pool ?? {
      id: 0,
      name: 'Default',
      href: '/app/rest/agentPools/id:0',
    },
    ...overrides,
  };
}

/**
 * Create an agents collection fixture
 */
export function createAgentsFixture(agents: TeamCityAgentFixture[] = []): {
  count: number;
  agent?: TeamCityAgentFixture[];
} {
  return {
    count: agents.length,
    agent: agents.length === 0 ? undefined : agents,
  };
}

// ============================================================================
// Test Occurrence Fixtures
// ============================================================================

/**
 * TeamCity test occurrence response (simplified for testing)
 */
export interface TeamCityTestOccurrenceFixture {
  id: string;
  name: string;
  status: 'SUCCESS' | 'FAILURE' | 'IGNORED' | 'UNKNOWN';
  duration?: number;
  details?: string;
  currentlyMuted?: boolean;
  currentlyInvestigated?: boolean;
  test?: {
    id: string;
    name: string;
  };
  build?: {
    id: number;
    buildTypeId: string;
  };
}

let testCounter = 0;

/**
 * Create a TeamCity test occurrence fixture
 */
export function createTestOccurrenceFixture(
  overrides: Partial<TeamCityTestOccurrenceFixture> = {}
): TeamCityTestOccurrenceFixture {
  testCounter++;
  const id = overrides.id ?? `test_${testCounter}`;
  return {
    id,
    name: overrides.name ?? `com.example.Test${testCounter}.testMethod`,
    status: overrides.status ?? 'SUCCESS',
    duration: overrides.duration ?? 100,
    ...overrides,
  };
}

/**
 * Create a failed test occurrence fixture
 */
export function createFailedTestFixture(
  overrides: Partial<TeamCityTestOccurrenceFixture> = {}
): TeamCityTestOccurrenceFixture {
  return createTestOccurrenceFixture({
    status: 'FAILURE',
    details: overrides.details ?? 'Expected true but was false',
    ...overrides,
  });
}

/**
 * Create a test occurrences collection fixture
 */
export function createTestOccurrencesFixture(tests: TeamCityTestOccurrenceFixture[] = []): {
  count: number;
  testOccurrence?: TeamCityTestOccurrenceFixture[];
} {
  return {
    count: tests.length,
    testOccurrence: tests.length === 0 ? undefined : tests,
  };
}

// ============================================================================
// Problem Occurrence Fixtures
// ============================================================================

/**
 * TeamCity problem occurrence response (simplified for testing)
 */
export interface TeamCityProblemOccurrenceFixture {
  id: string;
  type: string;
  identity: string;
  details?: string;
  additionalData?: string;
  build?: {
    id: number;
    buildTypeId: string;
  };
  problem?: {
    id: string;
    type: string;
    identity: string;
  };
}

let problemCounter = 0;

/**
 * Create a TeamCity problem occurrence fixture
 */
export function createProblemOccurrenceFixture(
  overrides: Partial<TeamCityProblemOccurrenceFixture> = {}
): TeamCityProblemOccurrenceFixture {
  problemCounter++;
  const id = overrides.id ?? `problem_${problemCounter}`;
  return {
    id,
    type: overrides.type ?? 'TC_COMPILATION_ERROR',
    identity: overrides.identity ?? `Compilation error in Module${problemCounter}`,
    details: overrides.details ?? 'Syntax error at line 42',
    ...overrides,
  };
}

/**
 * Create a problem occurrences collection fixture
 */
export function createProblemOccurrencesFixture(
  problems: TeamCityProblemOccurrenceFixture[] = []
): { count: number; problemOccurrence?: TeamCityProblemOccurrenceFixture[] } {
  return {
    count: problems.length,
    problemOccurrence: problems.length === 0 ? undefined : problems,
  };
}

// ============================================================================
// Reset Counters
// ============================================================================

/**
 * Reset all fixture counters (useful between tests)
 */
export function resetFixtureCounters(): void {
  projectCounter = 0;
  buildTypeCounter = 0;
  buildCounter = 0;
  triggerCounter = 0;
  stepCounter = 0;
  vcsRootCounter = 0;
  agentCounter = 0;
  testCounter = 0;
  problemCounter = 0;
}
