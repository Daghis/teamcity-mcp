/**
 * TeamCity API Response Type Definitions
 *
 * Comprehensive type definitions for TeamCity REST API responses
 * to improve type safety throughout the codebase.
 */

/**
 * Common property structure used in TeamCity API responses
 */
export interface TeamCityProperty {
  name: string;
  value: string;
  inherited?: boolean;
  type?: {
    rawValue?: string;
  };
}

/**
 * Properties collection used in various API responses
 */
export interface TeamCityProperties {
  count?: number;
  property?: TeamCityProperty | TeamCityProperty[];
}

/**
 * Build trigger API response structure
 */
export interface TeamCityTriggerResponse {
  id: string;
  type: string;
  disabled?: boolean;
  inherited?: boolean;
  properties?: TeamCityProperties;
}

/**
 * Build triggers collection response
 */
export interface TeamCityTriggersResponse {
  count?: number;
  trigger?: TeamCityTriggerResponse | TeamCityTriggerResponse[];
}

/**
 * Build step API response structure
 */
export interface TeamCityStepResponse {
  id: string;
  name: string;
  type: string;
  disabled?: boolean;
  inherited?: boolean;
  properties?: TeamCityProperties;
}

/**
 * Build steps collection response
 */
export interface TeamCityStepsResponse {
  count?: number;
  step?: TeamCityStepResponse | TeamCityStepResponse[];
}

/**
 * VCS root entry response
 */
export interface TeamCityVcsRootEntry {
  id: string;
  inherited?: boolean;
  'checkout-rules'?: string;
  'vcs-root': {
    id: string;
    name: string;
    href?: string;
    properties?: TeamCityProperties;
  };
}

/**
 * VCS root entries collection
 */
export interface TeamCityVcsRootEntriesResponse {
  count?: number;
  'vcs-root-entry'?: TeamCityVcsRootEntry | TeamCityVcsRootEntry[];
}

/**
 * Build type (configuration) response
 */
export interface TeamCityBuildTypeResponse {
  id: string;
  name: string;
  projectId: string;
  projectName?: string;
  description?: string;
  webUrl?: string;
  paused?: boolean;
  templateFlag?: boolean;
  parameters?: TeamCityProperties;
  settings?: TeamCityProperties;
  'vcs-root-entries'?: TeamCityVcsRootEntriesResponse;
  triggers?: TeamCityTriggersResponse;
  steps?: TeamCityStepsResponse;
  features?: {
    count?: number;
    feature?: Array<{
      id: string;
      type: string;
      properties?: TeamCityProperties;
    }>;
  };
  'snapshot-dependencies'?: {
    count?: number;
    'snapshot-dependency'?: Array<{
      id: string;
      type: string;
      properties?: TeamCityProperties;
      'source-buildType': {
        id: string;
        name: string;
      };
    }>;
  };
  'artifact-dependencies'?: {
    count?: number;
    'artifact-dependency'?: Array<{
      id: string;
      type: string;
      properties?: TeamCityProperties;
      'source-buildType': {
        id: string;
        name: string;
      };
    }>;
  };
}

/**
 * Build types collection response
 */
export interface TeamCityBuildTypesResponse {
  count?: number;
  buildType?: TeamCityBuildTypeResponse | TeamCityBuildTypeResponse[];
}

/**
 * Project response structure
 */
export interface TeamCityProjectResponse {
  id: string;
  name: string;
  parentProjectId?: string;
  href?: string;
  webUrl?: string;
  description?: string;
  archived?: boolean;
  parameters?: TeamCityProperties;
  projects?: {
    count?: number;
    project?: TeamCityProjectResponse | TeamCityProjectResponse[];
  };
  buildTypes?: TeamCityBuildTypesResponse;
}

/**
 * Projects collection response
 */
export interface TeamCityProjectsResponse {
  count?: number;
  project?: TeamCityProjectResponse | TeamCityProjectResponse[];
}

/**
 * Build response structure
 */
export interface TeamCityBuildResponse {
  id: number;
  buildTypeId: string;
  number?: string;
  status?: 'SUCCESS' | 'FAILURE' | 'ERROR' | 'UNKNOWN';
  state?: 'queued' | 'running' | 'finished';
  branchName?: string;
  defaultBranch?: boolean;
  href?: string;
  webUrl?: string;
  statusText?: string;
  buildType?: {
    id: string;
    name: string;
    projectId: string;
    projectName: string;
  };
  queuedDate?: string;
  startDate?: string;
  finishDate?: string;
  running?: boolean;
  percentageComplete?: number;
  properties?: TeamCityProperties;
  tags?: {
    count?: number;
    tag?: Array<{
      name: string;
    }>;
  };
  revisions?: {
    count?: number;
    revision?: Array<{
      version: string;
      vcsBranchName?: string;
      'vcs-root-instance': {
        id: string;
        name: string;
      };
    }>;
  };
  changes?: {
    count?: number;
    change?: Array<{
      id: number;
      version: string;
      username: string;
      date: string;
      comment?: string;
    }>;
  };
  artifacts?: {
    count?: number;
    file?: Array<{
      name: string;
      size: number;
      modificationTime: string;
      href?: string;
      content?: {
        href: string;
      };
    }>;
  };
  problemOccurrences?: {
    count?: number;
    problemOccurrence?: Array<{
      id: string;
      type: string;
      identity: string;
      details?: string;
      additionalData?: string;
    }>;
  };
  testOccurrences?: {
    count?: number;
    testOccurrence?: Array<{
      id: string;
      name: string;
      status: 'SUCCESS' | 'FAILURE' | 'IGNORED' | 'UNKNOWN';
      duration?: number;
      details?: string;
    }>;
  };
}

/**
 * Builds collection response
 */
export interface TeamCityBuildsResponse {
  count?: number;
  build?: TeamCityBuildResponse | TeamCityBuildResponse[];
}

/**
 * Error response structure
 */
export interface TeamCityErrorResponse {
  message?: string;
  details?: string;
}

/**
 * Type guards for safe type checking
 */
export const isTeamCityErrorResponse = (response: unknown): response is TeamCityErrorResponse => {
  return typeof response === 'object' && response !== null && 'message' in response;
};

export const isPropertyArray = (
  prop: TeamCityProperty | TeamCityProperty[] | undefined
): prop is TeamCityProperty[] => {
  return Array.isArray(prop);
};

export const isTriggerArray = (
  trigger: TeamCityTriggerResponse | TeamCityTriggerResponse[] | undefined
): trigger is TeamCityTriggerResponse[] => {
  return Array.isArray(trigger);
};

export const isStepArray = (
  step: TeamCityStepResponse | TeamCityStepResponse[] | undefined
): step is TeamCityStepResponse[] => {
  return Array.isArray(step);
};

export const isBuildTypeArray = (
  buildType: TeamCityBuildTypeResponse | TeamCityBuildTypeResponse[] | undefined
): buildType is TeamCityBuildTypeResponse[] => {
  return Array.isArray(buildType);
};

export const isVcsRootEntryArray = (
  entry: TeamCityVcsRootEntry | TeamCityVcsRootEntry[] | undefined
): entry is TeamCityVcsRootEntry[] => {
  return Array.isArray(entry);
};

/**
 * Helper function to normalize properties to array
 */
export function normalizeProperties(
  properties: TeamCityProperties | undefined
): TeamCityProperty[] {
  if (!properties?.property) {
    return [];
  }
  return isPropertyArray(properties.property) ? properties.property : [properties.property];
}

/**
 * Helper function to normalize triggers to array
 */
export function normalizeTriggers(
  response: TeamCityTriggersResponse | undefined
): TeamCityTriggerResponse[] {
  if (!response?.trigger) {
    return [];
  }
  return isTriggerArray(response.trigger) ? response.trigger : [response.trigger];
}

/**
 * Helper function to normalize steps to array
 */
export function normalizeSteps(
  response: TeamCityStepsResponse | undefined
): TeamCityStepResponse[] {
  if (!response?.step) {
    return [];
  }
  return isStepArray(response.step) ? response.step : [response.step];
}

/**
 * Helper function to normalize build types to array
 */
export function normalizeBuildTypes(
  response: TeamCityBuildTypesResponse | undefined
): TeamCityBuildTypeResponse[] {
  if (!response?.buildType) {
    return [];
  }
  return isBuildTypeArray(response.buildType) ? response.buildType : [response.buildType];
}

/**
 * Helper function to normalize VCS root entries to array
 */
export function normalizeVcsRootEntries(
  response: TeamCityVcsRootEntriesResponse | undefined
): TeamCityVcsRootEntry[] {
  if (!response?.['vcs-root-entry']) {
    return [];
  }
  return isVcsRootEntryArray(response['vcs-root-entry'])
    ? response['vcs-root-entry']
    : [response['vcs-root-entry']];
}

/**
 * Helper to extract properties as a typed record
 */
export function propertiesToRecord(properties: TeamCityProperty[]): Record<string, string> {
  const record: Record<string, string> = {};
  properties.forEach((prop) => {
    record[prop.name] = prop.value;
  });
  return record;
}
