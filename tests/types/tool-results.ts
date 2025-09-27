// Minimal, behavior-oriented types for MCP tool results used in integration tests
// Keep these narrow to what tests assert, to avoid coupling to full API schemas.

export interface ActionResult<A extends string = string> {
  success: boolean;
  action: A;
  [key: string]: unknown;
}

// Projects
export interface ProjectRef {
  id: string;
  name?: string;
}

export interface ListResult<T> {
  items?: T[];
  pagination?: unknown;
}

// Build types (subset used in tests)
export interface BuildTypeSummary {
  id: string;
  name?: string;
  triggers?: { trigger?: Array<{ id?: string; type?: string }> };
}

export interface TriggerBuildResult extends ActionResult<'trigger_build'> {
  buildId: string;
  state?: string;
  status?: string;
  branchName?: string;
}

export interface BuildRef {
  id?: number | string;
  number?: string;
}

export interface BuildLogChunk {
  lines: string[];
  meta: {
    buildId: string;
    page?: number;
    pageSize?: number;
    startLine?: number;
    nextPage?: number;
    prevPage?: number;
    hasMore?: boolean;
    totalLines?: number;
    nextStartLine?: number;
    mode?: 'tail' | 'page';
    buildNumber?: string;
    buildTypeId?: string;
  };
}

export interface BranchList {
  branches?: unknown[];
}

export interface QueuedBuild {
  id?: string | number;
}
export type QueuedBuildList = ListResult<QueuedBuild>;

export interface VcsRootRef {
  id: string;
}
