/**
 * Type definitions for TeamCity API responses
 * These interfaces match the actual API response structure
 */

// Build Types API Response Interfaces
export interface BuildTypeProperty {
  name: string;
  value: string;
  type?: string;
  inherited?: boolean;
}

export interface BuildTypeParameters {
  property?: BuildTypeProperty[];
  count?: number;
  href?: string;
}

export interface BuildTypeVcsRootEntry {
  id?: string;
  'checkout-rules'?: string;
  'vcs-root'?: {
    id: string;
    name?: string;
    vcsName?: string;
    href?: string;
    properties?: {
      property?: BuildTypeProperty[];
    };
  };
}

export interface BuildTypeVcsRootEntries {
  'vcs-root-entry'?: BuildTypeVcsRootEntry[];
  count?: number;
}

export interface BuildTypeStep {
  id: string;
  name?: string;
  type?: string;
  disabled?: boolean;
  properties?: BuildTypeParameters;
}

export interface BuildTypeSteps {
  step?: BuildTypeStep[];
  count?: number;
}

export interface BuildTypeTrigger {
  id: string;
  type?: string;
  disabled?: boolean;
  properties?: BuildTypeParameters;
}

export interface BuildTypeTriggers {
  trigger?: BuildTypeTrigger[];
  count?: number;
}

export interface BuildTypeFeature {
  id: string;
  type?: string;
  disabled?: boolean;
  properties?: BuildTypeParameters;
}

export interface BuildTypeFeatures {
  feature?: BuildTypeFeature[];
  count?: number;
}

export interface BuildTypeDependency {
  id?: string;
  sourceBuildTypeId?: string;
  dependsOnBuildTypeId?: string;
  properties?: BuildTypeParameters;
}

export interface BuildTypeArtifactDependencies {
  'artifact-dependency'?: BuildTypeDependency[];
  count?: number;
}

export interface BuildTypeSnapshotDependencies {
  'snapshot-dependency'?: BuildTypeDependency[];
  count?: number;
}

export interface BuildTypeSettings {
  property?: BuildTypeProperty[];
}

export interface BuildTypeTemplate {
  id: string;
  name?: string;
  projectId?: string;
}

export interface BuildTypeTemplates {
  buildType?: BuildTypeTemplate[];
}

export interface BuildTypeData {
  id?: string;
  name?: string;
  projectId?: string;
  projectName?: string;
  project?: {
    id: string;
    name?: string;
    parentProjectId?: string;
    parentProject?: {
      id: string;
      name?: string;
    };
  };
  description?: string;
  href?: string;
  webUrl?: string;
  paused?: boolean;
  lastBuildDate?: string;
  lastBuildStatus?: string;
  parameters?: BuildTypeParameters;
  'vcs-root-entries'?: BuildTypeVcsRootEntries;
  steps?: BuildTypeSteps;
  triggers?: BuildTypeTriggers;
  features?: BuildTypeFeatures;
  'artifact-dependencies'?: BuildTypeArtifactDependencies;
  'snapshot-dependencies'?: BuildTypeSnapshotDependencies;
  settings?: BuildTypeSettings;
  templates?: BuildTypeTemplates;
}

export interface BuildTypesResponse {
  buildType?: BuildTypeData[];
  count?: number;
  nextHref?: string;
}

// Project API Response Interfaces
export interface ProjectData {
  id?: string;
  name?: string;
  parentProjectId?: string;
  parentProject?: ProjectData;
  archived?: boolean;
  href?: string;
  webUrl?: string;
  description?: string;
}

export interface ProjectsResponse {
  project?: ProjectData[];
  count?: number;
}

// Build API Response Interfaces
export interface BuildTriggered {
  type: string;
  date: string;
  user?: {
    username?: string;
    name?: string;
    id?: number;
  };
}

export interface BuildData {
  id: number;
  number: string;
  status: string;
  state: string;
  buildTypeId: string;
  projectId?: string;
  branchName?: string;
  defaultBranch?: boolean;
  startDate?: string;
  finishDate?: string;
  queuedDate?: string;
  statusText?: string;
  webUrl?: string;
  href?: string;
  triggered?: BuildTriggered;
}

export interface BuildsResponse {
  build?: BuildData[];
  count?: number;
  nextHref?: string;
}

// Artifact Response Interfaces
export interface ArtifactFile {
  name: string;
  fullName?: string;
  size?: number;
  modificationTime?: string;
  href?: string;
}

export interface ArtifactsResponse {
  file?: ArtifactFile[];
  count?: number;
}

// Statistics Response Interfaces
export interface StatisticsProperty {
  name: string;
  value: string;
}

export interface StatisticsResponse {
  property?: StatisticsProperty[];
  count?: number;
}

// Changes Response Interfaces
export interface ChangeFile {
  name: string;
  changeType?: string;
  beforeRevision?: string;
  afterRevision?: string;
}

export interface ChangeFiles {
  file?: ChangeFile[];
  count?: number;
}

export interface ChangeData {
  id: number;
  version: string;
  username: string;
  date: string;
  comment?: string;
  files?: ChangeFiles;
  href?: string;
  webUrl?: string;
}

export interface ChangesResponse {
  change?: ChangeData[];
  count?: number;
  nextHref?: string;
}

// VCS Root Response Interfaces
export interface VcsRootProperty {
  name: string;
  value?: string;
}

export interface VcsRootProperties {
  property?: VcsRootProperty[];
  count?: number;
}

export interface VcsRootData {
  id?: string;
  name?: string;
  vcsName?: string;
  href?: string;
  project?: ProjectData;
  properties?: VcsRootProperties;
}

export interface VcsRootsResponse {
  'vcs-root'?: VcsRootData[];
  count?: number;
}

// Type Guards
export function isBuildTypeData(data: unknown): data is BuildTypeData {
  return (
    typeof data === 'object' &&
    data !== null &&
    ('id' in data || 'name' in data || 'projectId' in data)
  );
}

export function isBuildTypesResponse(data: unknown): data is BuildTypesResponse {
  return typeof data === 'object' && data !== null && ('buildType' in data || 'count' in data);
}

export function isProjectData(data: unknown): data is ProjectData {
  return typeof data === 'object' && data !== null && ('id' in data || 'name' in data);
}

export function isBuildData(data: unknown): data is BuildData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'number' in data &&
    'status' in data &&
    'state' in data
  );
}

export function isVcsRootData(data: unknown): data is VcsRootData {
  return (
    typeof data === 'object' &&
    data !== null &&
    ('id' in data || 'name' in data || 'vcsName' in data)
  );
}

export function isVcsRootsResponse(data: unknown): data is VcsRootsResponse {
  return typeof data === 'object' && data !== null && 'vcs-root' in data;
}
