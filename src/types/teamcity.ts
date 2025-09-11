/**
 * TeamCity API type definitions
 */

// Build Types
export interface TeamCityBuild {
  id: number;
  buildTypeId: string;
  number: string;
  status: 'SUCCESS' | 'FAILURE' | 'ERROR' | 'UNKNOWN';
  state: 'queued' | 'running' | 'finished';
  running: boolean;
  percentageComplete?: number;
  branchName?: string;
  defaultBranch?: boolean;
  href: string;
  webUrl: string;
  statusText?: string;
  buildType: {
    id: string;
    name: string;
    projectId: string;
    href: string;
    webUrl: string;
  };
  queuedDate: string;
  startDate?: string;
  finishDate?: string;
  lastChanges?: {
    change: TeamCityChange[];
  };
  agent?: TeamCityAgent;
  problemOccurrences?: {
    problemOccurrence: TeamCityProblemOccurrence[];
  };
  testOccurrences?: {
    testOccurrence: TeamCityTestOccurrence[];
  };
}

export interface TeamCityBuildType {
  id: string;
  name: string;
  projectId: string;
  href: string;
  webUrl: string;
  description?: string;
  paused: boolean;
  project: {
    id: string;
    name: string;
    href: string;
  };
  vcsRootEntries?: {
    vcsRootEntry: TeamCityVcsRootEntry[];
  };
  settings?: {
    property: TeamCityProperty[];
  };
  parameters?: {
    property: TeamCityProperty[];
  };
  steps?: {
    step: TeamCityBuildStep[];
  };
  features?: {
    feature: TeamCityBuildFeature[];
  };
  triggers?: {
    trigger: TeamCityBuildTrigger[];
  };
}

// Project Types
export interface TeamCityProject {
  id: string;
  name: string;
  description?: string;
  href: string;
  webUrl: string;
  parentProjectId?: string;
  archived: boolean;
  projects?: {
    project: TeamCityProject[];
  };
  buildTypes?: {
    buildType: TeamCityBuildType[];
  };
  parameters?: {
    property: TeamCityProperty[];
  };
}

// VCS Types
export interface TeamCityVcsRoot {
  id: string;
  name: string;
  vcsName: string;
  href: string;
  project?: {
    id: string;
    name: string;
    href: string;
  };
  properties?: {
    property: TeamCityProperty[];
  };
}

export interface TeamCityVcsRootEntry {
  id: string;
  vcsRoot: TeamCityVcsRoot;
  checkoutRules?: string;
}

// Agent Types
export interface TeamCityAgent {
  id: number;
  name: string;
  typeId: number;
  href: string;
  webUrl: string;
  connected: boolean;
  enabled: boolean;
  authorized: boolean;
  upToDate: boolean;
  ip?: string;
  pool?: {
    id: number;
    name: string;
    href: string;
  };
  build?: {
    id: number;
    buildTypeId: string;
    href: string;
  };
}

export interface TeamCityAgentPool {
  id: number;
  name: string;
  href: string;
  agents?: {
    agent: TeamCityAgent[];
  };
  projects?: {
    project: TeamCityProject[];
  };
}

// Test and Problem Types
export interface TeamCityTestOccurrence {
  id: string;
  name: string;
  status: 'SUCCESS' | 'FAILURE' | 'IGNORED';
  duration: number;
  muted: boolean;
  currentlyMuted: boolean;
  currentlyInvestigated: boolean;
  href: string;
  test?: {
    id: string;
    name: string;
    href: string;
  };
  build?: {
    id: number;
    buildTypeId: string;
    href: string;
  };
  details?: string;
  stackTrace?: string;
}

export interface TeamCityProblemOccurrence {
  id: string;
  type: string;
  identity: string;
  href: string;
  description: string;
  build?: {
    id: number;
    buildTypeId: string;
    href: string;
  };
  problemType?: {
    id: string;
    type: string;
    description: string;
  };
}

// Build Queue Types
export interface TeamCityQueuedBuild {
  id: number;
  buildTypeId: string;
  state: 'queued';
  href: string;
  webUrl: string;
  buildType: {
    id: string;
    name: string;
    projectId: string;
  };
  queuedDate: string;
  agent?: TeamCityAgent;
  comment?: {
    text: string;
  };
}

// Change Types
export interface TeamCityChange {
  id: number;
  version: string;
  username: string;
  date: string;
  href: string;
  webUrl: string;
  comment?: string;
  files?: {
    file: TeamCityChangeFile[];
  };
  vcsRootInstance?: {
    id: string;
    vcsRootId: string;
    name: string;
    href: string;
  };
}

export interface TeamCityChangeFile {
  beforeRevision?: string;
  afterRevision?: string;
  changeType: 'added' | 'edited' | 'removed';
  file?: string;
  relativeFile?: string;
}

// Build Step Types
export interface TeamCityBuildStep {
  id: string;
  name: string;
  type: string;
  disabled: boolean;
  properties?: {
    property: TeamCityProperty[];
  };
}

// Build Feature Types
export interface TeamCityBuildFeature {
  id: string;
  type: string;
  disabled: boolean;
  properties?: {
    property: TeamCityProperty[];
  };
}

// Build Trigger Types
export interface TeamCityBuildTrigger {
  id: string;
  type: string;
  disabled: boolean;
  properties?: {
    property: TeamCityProperty[];
  };
}

// Utility Types
export interface TeamCityProperty {
  name: string;
  value: string;
  inherited?: boolean;
}

export interface TeamCityLocator {
  [key: string]: string | number | boolean;
}

export interface TeamCityPagedResponse<T> {
  count: number;
  href: string;
  nextHref?: string;
  prevHref?: string;
  items: T[];
}
