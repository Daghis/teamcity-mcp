/**
 * Static Tool Definitions for TeamCity MCP Server
 * Simple, direct tool implementations without complex abstractions
 */
import { z } from 'zod';

import { getMCPMode as getMCPModeFromConfig } from '@/config';
import { type Mutes, ResolutionTypeEnum } from '@/teamcity-client/models';
import { BuildConfigurationUpdateManager } from '@/teamcity/build-configuration-update-manager';
import { BuildResultsManager } from '@/teamcity/build-results-manager';
import type { TeamCityClient } from '@/teamcity/client';
import { createAdapterFromTeamCityAPI } from '@/teamcity/client-adapter';
import { createPaginatedFetcher, fetchAllPages } from '@/teamcity/pagination';
import { debug } from '@/utils/logger';
import { json, runTool } from '@/utils/mcp';

import { TeamCityAPI } from './api-client';

// Tool response type
export interface ToolResponse {
  content?: Array<{ type: string; text: string }>;
  error?: string;
  success?: boolean;
  data?: unknown;
}

// Tool definition - handlers use unknown but are cast internally
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
  handler: (args: unknown) => Promise<ToolResponse>;
  mode?: 'dev' | 'full'; // If not specified, available in both modes
}

// Specific argument types are intentionally scoped to the handlers that use them.
// Zod validates at runtime; these interfaces keep compile-time safety and clean linting.
interface DeleteProjectArgs {
  projectId: string;
}
interface CreateBuildConfigArgs {
  projectId: string;
  name: string;
  id: string;
  description?: string;
}
interface CloneBuildConfigArgs {
  sourceBuildTypeId: string;
  name: string;
  id: string;
  projectId?: string;
}
interface UpdateBuildConfigArgs {
  buildTypeId: string;
  name?: string;
  description?: string;
  paused?: boolean;
  artifactRules?: string;
}
interface AddParameterArgs {
  buildTypeId: string;
  name: string;
  value: string;
}
interface UpdateParameterArgs {
  buildTypeId: string;
  name: string;
  value: string;
}
interface DeleteParameterArgs {
  buildTypeId: string;
  name: string;
}
interface CreateVCSRootArgs {
  projectId: string;
  name: string;
  id: string;
  vcsName: string;
  url: string;
  branch?: string;
}
interface AuthorizeAgentArgs {
  agentId: string;
  authorize: boolean;
}
interface AssignAgentToPoolArgs {
  agentId: string;
  poolId: string;
}
interface ManageBuildStepsArgs {
  buildTypeId: string;
  action: 'add' | 'update' | 'delete';
  stepId?: string;
  name?: string;
  type?: string;
  properties?: Record<string, unknown>;
}
interface ManageBuildTriggersArgs {
  buildTypeId: string;
  action: 'add' | 'delete';
  triggerId?: string;
  type?: string;
  properties?: Record<string, unknown>;
}

/**
 * Get the current MCP mode from environment
 */
export function getMCPMode(): 'dev' | 'full' {
  return getMCPModeFromConfig();
}

/**
 * Developer tools (dev mode) - Read-only operations for developers
 */
const DEV_TOOLS: ToolDefinition[] = [
  // === Basic Tools ===
  {
    name: 'ping',
    description: 'Test MCP server connectivity',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Optional message to echo back' },
      },
    },
    handler: async (args: unknown) => {
      const typedArgs = args as { message?: string };
      return {
        content: [
          {
            type: 'text',
            text: `pong${typedArgs.message ? `: ${typedArgs.message}` : ''}`,
          },
        ],
      };
    },
  },

  // === Project Tools ===
  {
    name: 'list_projects',
    description: 'List TeamCity projects (supports pagination)',
    inputSchema: {
      type: 'object',
      properties: {
        locator: { type: 'string', description: 'Optional locator to filter projects' },
        parentProjectId: { type: 'string', description: 'Filter by parent project ID' },
        pageSize: { type: 'number', description: 'Items per page (default 100)' },
        maxPages: { type: 'number', description: 'Max pages to fetch (when all=true)' },
        all: { type: 'boolean', description: 'Fetch all pages up to maxPages' },
        fields: {
          type: 'string',
          description: 'Optional fields selector for server-side projection',
        },
      },
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        locator: z.string().min(1).optional(),
        parentProjectId: z.string().min(1).optional(),
        pageSize: z.number().int().min(1).max(1000).optional(),
        maxPages: z.number().int().min(1).max(1000).optional(),
        all: z.boolean().optional(),
        fields: z.string().min(1).optional(),
      });
      return runTool(
        'list_projects',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const baseParts: string[] = [];
          if (typed.locator) baseParts.push(typed.locator);
          if (typed.parentProjectId) baseParts.push(`parent:(id:${typed.parentProjectId})`);

          const pageSize = typed.pageSize ?? 100;

          const baseFetch = async ({ count, start }: { count?: number; start?: number }) => {
            const parts = [...baseParts];
            if (typeof count === 'number') parts.push(`count:${count}`);
            if (typeof start === 'number') parts.push(`start:${start}`);
            const locator = parts.length > 0 ? parts.join(',') : undefined;
            return api.projects.getAllProjects(locator as string | undefined, typed.fields);
          };

          const fetcher = createPaginatedFetcher(
            baseFetch,
            (response: unknown) => {
              const data = response as { project?: unknown[]; count?: number };
              return Array.isArray(data.project) ? (data.project as unknown[]) : [];
            },
            (response: unknown) => {
              const data = response as { count?: number };
              return typeof data.count === 'number' ? data.count : undefined;
            }
          );

          if (typed.all) {
            const items = await fetchAllPages(fetcher, { pageSize, maxPages: typed.maxPages });
            return json({ items, pagination: { mode: 'all', pageSize, fetched: items.length } });
          }

          const firstPage = await fetcher({ count: pageSize, start: 0 });
          return json({ items: firstPage.items, pagination: { page: 1, pageSize } });
        },
        args
      );
    },
  },

  {
    name: 'get_project',
    description: 'Get details of a specific project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
      },
      required: ['projectId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({ projectId: z.string().min(1) });
      return runTool(
        'get_project',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const project = await api.getProject(typed.projectId);
          return json(project);
        },
        args
      );
    },
  },

  // === Build Tools ===
  {
    name: 'list_builds',
    description: 'List TeamCity builds (supports pagination)',
    inputSchema: {
      type: 'object',
      properties: {
        locator: { type: 'string', description: 'Optional build locator to filter builds' },
        projectId: { type: 'string', description: 'Filter by project ID' },
        buildTypeId: { type: 'string', description: 'Filter by build type ID' },
        status: {
          type: 'string',
          enum: ['SUCCESS', 'FAILURE', 'ERROR'],
          description: 'Filter by status',
        },
        count: { type: 'number', description: 'Deprecated: use pageSize', default: 10 },
        pageSize: { type: 'number', description: 'Items per page (default 100)' },
        maxPages: { type: 'number', description: 'Max pages to fetch (when all=true)' },
        all: { type: 'boolean', description: 'Fetch all pages up to maxPages' },
        fields: {
          type: 'string',
          description: 'Optional fields selector for server-side projection',
        },
      },
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        locator: z.string().min(1).optional(),
        projectId: z.string().min(1).optional(),
        buildTypeId: z.string().min(1).optional(),
        status: z.enum(['SUCCESS', 'FAILURE', 'ERROR']).optional(),
        count: z.number().int().min(1).max(1000).default(10).optional(),
        pageSize: z.number().int().min(1).max(1000).optional(),
        maxPages: z.number().int().min(1).max(1000).optional(),
        all: z.boolean().optional(),
        fields: z.string().min(1).optional(),
      });

      return runTool(
        'list_builds',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          // Build shared filter parts
          const baseParts: string[] = [];
          if (typed.locator) baseParts.push(typed.locator);
          if (typed.projectId) baseParts.push(`project:(id:${typed.projectId})`);
          if (typed.buildTypeId) baseParts.push(`buildType:(id:${typed.buildTypeId})`);
          if (typed.status) baseParts.push(`status:${typed.status}`);

          const pageSize = typed.pageSize ?? typed.count ?? 100;

          const baseFetch = async ({ count, start }: { count?: number; start?: number }) => {
            const parts = [...baseParts];
            if (typeof count === 'number') parts.push(`count:${count}`);
            if (typeof start === 'number') parts.push(`start:${start}`);
            const locator = parts.length > 0 ? parts.join(',') : undefined;
            // Use the generated client directly to retain nextHref/prevHref in response.data
            return api.builds.getAllBuilds(locator as string | undefined, typed.fields);
          };

          const fetcher = createPaginatedFetcher(
            baseFetch,
            (response: unknown) => {
              const data = response as { build?: unknown[]; count?: number };
              return Array.isArray(data.build) ? (data.build as unknown[]) : [];
            },
            (response: unknown) => {
              const data = response as { count?: number };
              return typeof data.count === 'number' ? data.count : undefined;
            }
          );

          if (typed.all) {
            const items = await fetchAllPages(fetcher, {
              pageSize,
              maxPages: typed.maxPages,
            });
            return json({ items, pagination: { mode: 'all', pageSize, fetched: items.length } });
          }

          // Single page
          const firstPage = await fetcher({ count: pageSize, start: 0 });
          return json({ items: firstPage.items, pagination: { page: 1, pageSize } });
        },
        args
      );
    },
  },

  {
    name: 'get_build',
    description: 'Get details of a specific build',
    inputSchema: {
      type: 'object',
      properties: {
        buildId: { type: 'string', description: 'Build ID' },
      },
      required: ['buildId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({ buildId: z.string().min(1) });
      return runTool(
        'get_build',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const build = await api.getBuild(typed.buildId);
          return json(build);
        },
        args
      );
    },
  },

  {
    name: 'trigger_build',
    description: 'Trigger a new build',
    inputSchema: {
      type: 'object',
      properties: {
        buildTypeId: { type: 'string', description: 'Build type ID to trigger' },
        branchName: { type: 'string', description: 'Branch to build (optional)' },
        comment: { type: 'string', description: 'Build comment (optional)' },
      },
      required: ['buildTypeId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        buildTypeId: z.string().min(1),
        branchName: z.string().min(1).max(255).optional(),
        comment: z.string().max(500).optional(),
      });

      return runTool(
        'trigger_build',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          try {
            const build = await api.triggerBuild(
              typed.buildTypeId,
              typed.branchName,
              typed.comment
            );
            return json({
              success: true,
              action: 'trigger_build',
              buildId: String(build.id ?? ''),
              state: (build.state as string) ?? undefined,
              status: (build.status as string) ?? undefined,
            });
          } catch (e) {
            // Fallback to XML body in case server rejects JSON body
            const branchPart = typed.branchName
              ? `<branchName>${typed.branchName}</branchName>`
              : '';
            const commentPart = typed.comment
              ? `<comment><text>${typed.comment.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text></comment>`
              : '';
            const xml = `<?xml version="1.0" encoding="UTF-8"?><build><buildType id="${typed.buildTypeId}"/>${branchPart}${commentPart}</build>`;
            const response = await api.buildQueue.addBuildToQueue(false, xml as unknown as never, {
              headers: { 'Content-Type': 'application/xml', Accept: 'application/json' },
            });
            const build = response.data as { id?: number; state?: string; status?: string };
            return json({
              success: true,
              action: 'trigger_build',
              buildId: String(build.id ?? ''),
              state: (build.state as string) ?? undefined,
              status: (build.status as string) ?? undefined,
            });
          }
        },
        args
      );
    },
  },

  {
    name: 'cancel_queued_build',
    description: 'Cancel a queued build by ID',
    inputSchema: {
      type: 'object',
      properties: {
        buildId: { type: 'string', description: 'Queued build ID' },
      },
      required: ['buildId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({ buildId: z.string().min(1) });
      return runTool(
        'cancel_queued_build',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          await api.buildQueue.deleteQueuedBuild(typed.buildId);
          return json({ success: true, action: 'cancel_queued_build', buildId: typed.buildId });
        },
        args
      );
    },
    // Available in dev and full modes (developer convenience)
  },

  {
    name: 'get_build_status',
    description: 'Get build status with optional test/problem and queue context details',
    inputSchema: {
      type: 'object',
      properties: {
        buildId: { type: 'string', description: 'Build ID' },
        includeTests: { type: 'boolean', description: 'Include test summary' },
        includeProblems: { type: 'boolean', description: 'Include build problems' },
        includeQueueTotals: {
          type: 'boolean',
          description: 'Include total queued count (extra API call when queued)',
        },
        includeQueueReason: {
          type: 'boolean',
          description: 'Include waitReason for the queued item (extra API call when queued)',
        },
      },
      required: ['buildId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        buildId: z.string().min(1),
        includeTests: z.boolean().optional(),
        includeProblems: z.boolean().optional(),
        includeQueueTotals: z.boolean().optional(),
        includeQueueReason: z.boolean().optional(),
      });
      return runTool(
        'get_build_status',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const statusManager = new (
            await import('@/teamcity/build-status-manager')
          ).BuildStatusManager(createAdapterFromTeamCityAPI(api));
          const result = await statusManager.getBuildStatus({
            buildId: typed.buildId,
            includeTests: typed.includeTests,
            includeProblems: typed.includeProblems,
          });

          if (result.state === 'queued') {
            const enrich: { totalQueued?: number; waitReason?: string; canMoveToTop?: boolean } =
              {};
            // Derive canMoveToTop without extra call
            if (typeof result.queuePosition === 'number') {
              enrich.canMoveToTop = result.queuePosition > 1;
            }

            if (typed.includeQueueTotals) {
              try {
                const countResp = await api.buildQueue.getAllQueuedBuilds(undefined, 'count');
                enrich.totalQueued = (countResp.data as { count?: number }).count;
              } catch {
                /* ignore */
              }
            }
            if (typed.includeQueueReason) {
              try {
                const qb = await api.buildQueue.getQueuedBuild(typed.buildId);
                enrich.waitReason = (qb.data as { waitReason?: string }).waitReason;
              } catch {
                /* ignore */
              }
            }
            return json({ ...result, ...enrich });
          }

          return json(result);
        },
        args
      );
    },
  },

  {
    name: 'fetch_build_log',
    description: 'Fetch build log with pagination (by lines)',
    inputSchema: {
      type: 'object',
      properties: {
        buildId: { type: 'string', description: 'Build ID (TeamCity internal id)' },
        buildNumber: {
          type: 'string',
          description:
            'Human build number (e.g., 54). If provided, optionally include buildTypeId to disambiguate.',
        },
        buildTypeId: {
          type: 'string',
          description: 'Optional build type ID to disambiguate buildNumber',
        },
        page: { type: 'number', description: '1-based page number' },
        pageSize: { type: 'number', description: 'Lines per page (default 500)' },
        startLine: { type: 'number', description: '0-based start line (overrides page)' },
        lineCount: { type: 'number', description: 'Max lines to return (overrides pageSize)' },
        tail: { type: 'boolean', description: 'Tail mode: return last N lines' },
      },
      required: [],
    },
    handler: async (args: unknown) => {
      const schema = z
        .object({
          buildId: z.string().min(1).optional(),
          buildNumber: z.union([z.string().min(1), z.number().int().min(0)]).optional(),
          buildTypeId: z.string().min(1).optional(),
          page: z.number().int().min(1).optional(),
          pageSize: z.number().int().min(1).max(5000).optional(),
          startLine: z.number().int().min(0).optional(),
          lineCount: z.number().int().min(1).max(5000).optional(),
          tail: z.boolean().optional(),
        })
        .refine((v) => Boolean(v.buildId) || Boolean(v.buildNumber), {
          message: 'Provide either buildId or buildNumber',
        });

      return runTool(
        'fetch_build_log',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();

          // Resolve effective buildId from buildId or buildNumber (+ optional buildTypeId)
          let effectiveBuildId: string | undefined;
          if (typed.buildId) {
            effectiveBuildId = typed.buildId;
          } else {
            const numberStr = String(typed.buildNumber);
            const baseLocatorParts: string[] = [];
            if (typed.buildTypeId) baseLocatorParts.push(`buildType:(id:${typed.buildTypeId})`);
            // Include non-default branches so build numbers on PR branches resolve
            baseLocatorParts.push('branch:default:any');
            baseLocatorParts.push(`number:${numberStr}`);
            // Limit result set to avoid huge payloads
            baseLocatorParts.push('count:10');
            const locator = baseLocatorParts.join(',');
            const resp = (await api.listBuilds(locator)) as {
              build?: Array<{ id?: number; buildTypeId?: string }>;
            };
            const builds = Array.isArray(resp.build) ? resp.build : [];
            if (builds.length === 0) {
              // Fallback: if buildTypeId is provided, fetch recent builds for that configuration and match by number
              if (typed.buildTypeId) {
                const recent = (await api.listBuilds(
                  `buildType:(id:${typed.buildTypeId}),branch:default:any,count:100`
                )) as { build?: Array<{ id?: number; number?: string }> };
                const items = Array.isArray(recent.build) ? recent.build : [];
                const match = items.find((b) => String(b.number) === numberStr);
                if (match?.id != null) {
                  effectiveBuildId = String(match.id);
                } else {
                  throw new Error(
                    `No build found with number ${numberStr} for buildTypeId ${typed.buildTypeId}`
                  );
                }
              } else {
                throw new Error(
                  `No build found with number ${numberStr}${typed.buildTypeId ? ` for buildTypeId ${typed.buildTypeId}` : ''}`
                );
              }
            }
            if (!effectiveBuildId && !typed.buildTypeId && builds.length > 1) {
              throw new Error(
                `Multiple builds match number ${numberStr}. Provide buildTypeId to disambiguate.`
              );
            }
            if (!effectiveBuildId) {
              const found = builds[0];
              if (!found?.id) {
                throw new Error('Resolved build has no id');
              }
              effectiveBuildId = String(found.id);
            }
          }
          if (!effectiveBuildId) {
            throw new Error('Failed to resolve buildId from inputs');
          }

          // Tail mode: return last N lines regardless of provided paging params
          if (typed.tail) {
            const count = typed.lineCount ?? typed.pageSize ?? 500;
            const full = await api.getBuildLog(effectiveBuildId);
            const allLines = full.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
            if (allLines.length > 0 && allLines[allLines.length - 1] === '') allLines.pop();
            const total = allLines.length;
            const start = Math.max(0, total - count);
            const lines = allLines.slice(start);

            return json({
              lines,
              meta: {
                buildId: effectiveBuildId,
                buildNumber:
                  typeof typed.buildNumber !== 'undefined' ? String(typed.buildNumber) : undefined,
                buildTypeId: typed.buildTypeId,
                mode: 'tail',
                pageSize: count,
                startLine: start,
                hasMore: start > 0,
                totalLines: total,
              },
            });
          }

          const effectivePageSize = typed.lineCount ?? typed.pageSize ?? 500;
          const startLine =
            typeof typed.startLine === 'number'
              ? typed.startLine
              : ((typed.page ?? 1) - 1) * effectivePageSize;

          const chunk = await api.getBuildLogChunk(effectiveBuildId, {
            startLine,
            lineCount: effectivePageSize,
          });

          const page = Math.floor(startLine / effectivePageSize) + 1;
          const hasMore = chunk.nextStartLine !== undefined;

          return json({
            lines: chunk.lines,
            meta: {
              buildId: effectiveBuildId,
              buildNumber:
                typeof typed.buildNumber !== 'undefined' ? String(typed.buildNumber) : undefined,
              buildTypeId: typed.buildTypeId,
              page,
              pageSize: effectivePageSize,
              startLine: chunk.startLine,
              nextPage: hasMore ? page + 1 : undefined,
              prevPage: page > 1 ? page - 1 : undefined,
              hasMore,
              totalLines: chunk.totalLines,
              nextStartLine: chunk.nextStartLine,
            },
          });
        },
        args
      );
    },
  },

  // === Build Configuration Tools ===
  {
    name: 'list_build_configs',
    description: 'List build configurations (supports pagination)',
    inputSchema: {
      type: 'object',
      properties: {
        locator: { type: 'string', description: 'Optional build type locator to filter' },
        projectId: { type: 'string', description: 'Filter by project ID' },
        pageSize: { type: 'number', description: 'Items per page (default 100)' },
        maxPages: { type: 'number', description: 'Max pages to fetch (when all=true)' },
        all: { type: 'boolean', description: 'Fetch all pages up to maxPages' },
        fields: {
          type: 'string',
          description: 'Optional fields selector for server-side projection',
        },
      },
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        locator: z.string().min(1).optional(),
        projectId: z.string().min(1).optional(),
        pageSize: z.number().int().min(1).max(1000).optional(),
        maxPages: z.number().int().min(1).max(1000).optional(),
        all: z.boolean().optional(),
        fields: z.string().min(1).optional(),
      });
      return runTool(
        'list_build_configs',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const baseParts: string[] = [];
          if (typed.locator) baseParts.push(typed.locator);
          if (typed.projectId) baseParts.push(`affectedProject:(id:${typed.projectId})`);

          const pageSize = typed.pageSize ?? 100;

          const baseFetch = async ({ count, start }: { count?: number; start?: number }) => {
            const parts = [...baseParts];
            if (typeof count === 'number') parts.push(`count:${count}`);
            if (typeof start === 'number') parts.push(`start:${start}`);
            const locator = parts.length > 0 ? parts.join(',') : undefined;
            return api.buildTypes.getAllBuildTypes(locator as string | undefined, typed.fields);
          };

          const fetcher = createPaginatedFetcher(
            baseFetch,
            (response: unknown) => {
              const data = response as { buildType?: unknown[]; count?: number };
              return Array.isArray(data.buildType) ? (data.buildType as unknown[]) : [];
            },
            (response: unknown) => {
              const data = response as { count?: number };
              return typeof data.count === 'number' ? data.count : undefined;
            }
          );

          if (typed.all) {
            const items = await fetchAllPages(fetcher, { pageSize, maxPages: typed.maxPages });
            return json({ items, pagination: { mode: 'all', pageSize, fetched: items.length } });
          }

          const firstPage = await fetcher({ count: pageSize, start: 0 });
          return json({ items: firstPage.items, pagination: { page: 1, pageSize } });
        },
        args
      );
    },
  },

  {
    name: 'get_build_config',
    description: 'Get details of a build configuration',
    inputSchema: {
      type: 'object',
      properties: {
        buildTypeId: { type: 'string', description: 'Build type ID' },
      },
      required: ['buildTypeId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({ buildTypeId: z.string().min(1) });
      return runTool(
        'get_build_config',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const buildType = await api.getBuildType(typed.buildTypeId);
          return json(buildType);
        },
        args
      );
    },
  },

  // === Test Tools ===
  {
    name: 'list_test_failures',
    description: 'List test failures for a build (supports pagination)',
    inputSchema: {
      type: 'object',
      properties: {
        buildId: { type: 'string', description: 'Build ID' },
        pageSize: { type: 'number', description: 'Items per page (default 100)' },
        maxPages: { type: 'number', description: 'Max pages to fetch (when all=true)' },
        all: { type: 'boolean', description: 'Fetch all pages up to maxPages' },
        fields: {
          type: 'string',
          description: 'Optional fields selector for server-side projection',
        },
      },
      required: ['buildId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        buildId: z.string().min(1),
        pageSize: z.number().int().min(1).max(1000).optional(),
        maxPages: z.number().int().min(1).max(1000).optional(),
        all: z.boolean().optional(),
        fields: z.string().min(1).optional(),
      });
      return runTool(
        'list_test_failures',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const pageSize = typed.pageSize ?? 100;
          const baseFetch = async ({ count, start }: { count?: number; start?: number }) => {
            const parts: string[] = [`build:(id:${typed.buildId})`, 'status:FAILURE'];
            if (typeof count === 'number') parts.push(`count:${count}`);
            if (typeof start === 'number') parts.push(`start:${start}`);
            const locator = parts.join(',');
            return api.tests.getAllTestOccurrences(locator as string, typed.fields);
          };

          const fetcher = createPaginatedFetcher(
            baseFetch,
            (response: unknown) => {
              const data = response as { testOccurrence?: unknown[]; count?: number };
              return Array.isArray(data.testOccurrence) ? (data.testOccurrence as unknown[]) : [];
            },
            (response: unknown) => {
              const data = response as { count?: number };
              return typeof data.count === 'number' ? data.count : undefined;
            }
          );

          if (typed.all) {
            const items = await fetchAllPages(fetcher, { pageSize, maxPages: typed.maxPages });
            return json({ items, pagination: { mode: 'all', pageSize, fetched: items.length } });
          }

          const firstPage = await fetcher({ count: pageSize, start: 0 });
          return json({ items: firstPage.items, pagination: { page: 1, pageSize } });
        },
        args
      );
    },
  },

  // === VCS Tools ===
  {
    name: 'list_vcs_roots',
    description: 'List VCS roots (supports pagination)',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Filter by project ID' },
        pageSize: { type: 'number', description: 'Items per page (default 100)' },
        maxPages: { type: 'number', description: 'Max pages to fetch (when all=true)' },
        all: { type: 'boolean', description: 'Fetch all pages up to maxPages' },
        fields: {
          type: 'string',
          description: 'Optional fields selector for server-side projection',
        },
      },
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        projectId: z.string().min(1).optional(),
        pageSize: z.number().int().min(1).max(1000).optional(),
        maxPages: z.number().int().min(1).max(1000).optional(),
        all: z.boolean().optional(),
        fields: z.string().min(1).optional(),
      });
      return runTool(
        'list_vcs_roots',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const baseParts: string[] = [];
          if (typed.projectId) baseParts.push(`affectedProject:(id:${typed.projectId})`);

          const pageSize = typed.pageSize ?? 100;
          const baseFetch = async ({ count, start }: { count?: number; start?: number }) => {
            const parts = [...baseParts];
            if (typeof count === 'number') parts.push(`count:${count}`);
            if (typeof start === 'number') parts.push(`start:${start}`);
            const locator = parts.length > 0 ? parts.join(',') : undefined;
            return api.vcsRoots.getAllVcsRoots(locator as string | undefined, typed.fields);
          };

          const fetcher = createPaginatedFetcher(
            baseFetch,
            (response: unknown) => {
              const data = response as { ['vcs-root']?: unknown[]; count?: number };
              return Array.isArray(data['vcs-root']) ? (data['vcs-root'] as unknown[]) : [];
            },
            (response: unknown) => {
              const data = response as { count?: number };
              return typeof data.count === 'number' ? data.count : undefined;
            }
          );

          if (typed.all) {
            const items = await fetchAllPages(fetcher, { pageSize, maxPages: typed.maxPages });
            return json({ items, pagination: { mode: 'all', pageSize, fetched: items.length } });
          }

          const firstPage = await fetcher({ count: pageSize, start: 0 });
          return json({ items: firstPage.items, pagination: { page: 1, pageSize } });
        },
        args
      );
    },
  },

  {
    name: 'get_vcs_root',
    description: 'Get details of a VCS root (including properties)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'VCS root ID' },
      },
      required: ['id'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({ id: z.string().min(1) });
      return runTool(
        'get_vcs_root',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const listing = await api.vcsRoots.getAllVcsRoots(`id:${typed.id}`);
          const rootEntry = (listing.data as { vcsRoot?: unknown[] }).vcsRoot?.[0] as
            | { id?: string; name?: string; href?: string }
            | undefined;
          const props = await api.vcsRoots.getAllVcsRootProperties(typed.id);
          return json({
            id: rootEntry?.id ?? typed.id,
            name: rootEntry?.name,
            href: rootEntry?.href,
            properties: props.data,
          });
        },
        args
      );
    },
  },

  {
    name: 'set_vcs_root_property',
    description: 'Set a single VCS root property (e.g., branch, branchSpec, url)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'VCS root ID' },
        name: { type: 'string', description: 'Property name (e.g., branch, branchSpec, url)' },
        value: { type: 'string', description: 'Property value' },
      },
      required: ['id', 'name', 'value'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        value: z.string(),
      });
      return runTool(
        'set_vcs_root_property',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          await api.vcsRoots.setVcsRootProperty(typed.id, typed.name, typed.value, {
            headers: { 'Content-Type': 'text/plain', Accept: 'text/plain' },
          });
          return json({
            success: true,
            action: 'set_vcs_root_property',
            id: typed.id,
            name: typed.name,
          });
        },
        args
      );
    },
    mode: 'full',
  },

  {
    name: 'delete_vcs_root_property',
    description: 'Delete a single VCS root property',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'VCS root ID' },
        name: { type: 'string', description: 'Property name' },
      },
      required: ['id', 'name'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({ id: z.string().min(1), name: z.string().min(1) });
      return runTool(
        'delete_vcs_root_property',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          await api.vcsRoots.deleteVcsRootProperty(typed.id, typed.name);
          return json({
            success: true,
            action: 'delete_vcs_root_property',
            id: typed.id,
            name: typed.name,
          });
        },
        args
      );
    },
    mode: 'full',
  },

  {
    name: 'update_vcs_root_properties',
    description: 'Update common VCS root properties in one call',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'VCS root ID' },
        url: { type: 'string', description: 'Repository URL' },
        branch: { type: 'string', description: 'Default branch (e.g., refs/heads/main)' },
        branchSpec: {
          oneOf: [
            { type: 'string', description: 'Branch spec as newline-delimited string' },
            { type: 'array', items: { type: 'string' }, description: 'Array of branch spec lines' },
          ],
        },
        checkoutRules: { type: 'string', description: 'Checkout rules' },
      },
      required: ['id'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        id: z.string().min(1),
        url: z.string().min(1).optional(),
        branch: z.string().min(1).optional(),
        branchSpec: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]).optional(),
        checkoutRules: z.string().min(1).optional(),
      });
      return runTool(
        'update_vcs_root_properties',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();

          const properties: { name: string; value: string }[] = [];
          if (typeof typed.url === 'string') properties.push({ name: 'url', value: typed.url });
          if (typeof typed.branch === 'string')
            properties.push({ name: 'branch', value: typed.branch });
          if (typeof typed.checkoutRules === 'string')
            properties.push({ name: 'checkout-rules', value: typed.checkoutRules });
          if (typed.branchSpec !== undefined) {
            const value = Array.isArray(typed.branchSpec)
              ? typed.branchSpec.join('\n')
              : typed.branchSpec;
            properties.push({ name: 'branchSpec', value });
          }

          if (properties.length === 0) {
            return json({
              success: true,
              action: 'update_vcs_root_properties',
              id: typed.id,
              updated: 0,
            });
          }

          await api.vcsRoots.setVcsRootProperties(
            typed.id,
            undefined,
            { property: properties },
            { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
          );
          return json({
            success: true,
            action: 'update_vcs_root_properties',
            id: typed.id,
            updated: properties.length,
          });
        },
        args
      );
    },
    mode: 'full',
  },

  // === Queue (read-only) ===
  {
    name: 'list_queued_builds',
    description: 'List queued builds (supports TeamCity queue locator + pagination)',
    inputSchema: {
      type: 'object',
      properties: {
        locator: {
          type: 'string',
          description: 'Queue locator filter (e.g., project:(id:MyProj))',
        },
        pageSize: { type: 'number', description: 'Items per page (default 100)' },
        maxPages: { type: 'number', description: 'Max pages to fetch (when all=true)' },
        all: { type: 'boolean', description: 'Fetch all pages up to maxPages' },
        fields: {
          type: 'string',
          description: 'Optional fields selector for server-side projection',
        },
      },
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        locator: z.string().min(1).optional(),
        pageSize: z.number().int().min(1).max(1000).optional(),
        maxPages: z.number().int().min(1).max(1000).optional(),
        all: z.boolean().optional(),
        fields: z.string().min(1).optional(),
      });
      return runTool(
        'list_queued_builds',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const baseParts: string[] = [];
          if (typed.locator) baseParts.push(typed.locator);
          const pageSize = typed.pageSize ?? 100;

          const baseFetch = async ({ count, start }: { count?: number; start?: number }) => {
            const parts = [...baseParts];
            if (typeof count === 'number') parts.push(`count:${count}`);
            if (typeof start === 'number') parts.push(`start:${start}`);
            const locator = parts.length > 0 ? parts.join(',') : undefined;
            return api.buildQueue.getAllQueuedBuilds(locator as string | undefined, typed.fields);
          };

          const fetcher = createPaginatedFetcher(
            baseFetch,
            (response: unknown) => {
              const data = response as { build?: unknown[]; count?: number };
              return Array.isArray(data.build) ? (data.build as unknown[]) : [];
            },
            (response: unknown) => {
              const data = response as { count?: number };
              return typeof data.count === 'number' ? data.count : undefined;
            }
          );

          if (typed.all) {
            const items = await fetchAllPages(fetcher, { pageSize, maxPages: typed.maxPages });
            return json({ items, pagination: { mode: 'all', pageSize, fetched: items.length } });
          }

          const firstPage = await fetcher({ count: pageSize, start: 0 });
          return json({ items: firstPage.items, pagination: { page: 1, pageSize } });
        },
        args
      );
    },
  },

  // === Server Health & Metrics (read-only) ===
  {
    name: 'get_server_metrics',
    description: 'Fetch server metrics (CPU/memory/disk/load) if available',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_args: unknown) => {
      return runTool(
        'get_server_metrics',
        null,
        async () => {
          const api = TeamCityAPI.getInstance();
          const metrics = await api.server.getAllMetrics();
          return json(metrics.data);
        },
        {}
      );
    },
    mode: 'full',
  },
  {
    name: 'get_server_info',
    description: 'Get TeamCity server info (version, build number, state)',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_args: unknown) => {
      return runTool(
        'get_server_info',
        null,
        async () => {
          const api = TeamCityAPI.getInstance();
          const info = await api.server.getServerInfo();
          return json(info.data);
        },
        {}
      );
    },
  },
  {
    name: 'list_server_health_items',
    description: 'List server health items (warnings/errors) for readiness checks',
    inputSchema: {
      type: 'object',
      properties: {
        locator: {
          type: 'string',
          description:
            'Optional health item locator filter. Omit or empty string fetches all items.',
        },
      },
    },
    handler: async (args: unknown) => {
      const schema = z.object({ locator: z.string().optional() });
      return runTool(
        'list_server_health_items',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          // Normalize locator: treat empty/whitespace-only as undefined (fetch all)
          // and adjust known-safe patterns (e.g., category:(ERROR) -> category:ERROR)
          const normalized = (() => {
            const raw = typeof typed.locator === 'string' ? typed.locator.trim() : undefined;
            if (!raw || raw.length === 0) return undefined;
            // Remove parentheses around known severities for category filter
            return raw.replace(/category:\s*\((ERROR|WARNING|INFO)\)/g, 'category:$1');
          })();
          try {
            const response = await api.health.getHealthItems(normalized);
            return json(response.data);
          } catch (err) {
            // Some TeamCity versions reject locator filters for /app/rest/health (HTTP 400).
            // Fall back to fetching all items and apply a best-effort client-side filter
            // for common patterns to avoid failing the tool call.
            const isHttp400 =
              (err as { statusCode?: number })?.statusCode === 400 ||
              (err as { code?: string })?.code === 'VALIDATION_ERROR';
            if (!isHttp400) throw err;

            const all = await api.health.getHealthItems();
            const rawItems = (all.data?.healthItem ?? []) as Array<Record<string, unknown>>;

            // Basic filter parser: key:value pairs separated by commas.
            // Supports keys: severity, category, id. Ignores unknown keys.
            const filter = (item: Record<string, unknown>): boolean => {
              if (!normalized) return true;
              const clauses = normalized
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
              for (const c of clauses) {
                const [k, v] = c.split(':');
                if (!k || v === undefined) continue;
                const key = k.trim();
                const val = v.trim();
                if (key === 'severity') {
                  if (String(item['severity'] ?? '').toUpperCase() !== val.toUpperCase())
                    return false;
                } else if (key === 'category') {
                  if (String(item['category'] ?? '') !== val) return false;
                } else if (key === 'id') {
                  if (String(item['id'] ?? '') !== val) return false;
                }
              }
              return true;
            };

            const items = rawItems.filter(filter);
            return json({
              count: items.length,
              healthItem: items,
              href: '/app/rest/health',
              note: 'Applied client-side filtering due to TeamCity 400 on locator. Unsupported filters ignored.',
            });
          }
        },
        args
      );
    },
    mode: 'full',
  },
  {
    name: 'get_server_health_item',
    description: 'Get a single server health item by locator',
    inputSchema: {
      type: 'object',
      properties: { locator: { type: 'string', description: 'Health item locator' } },
      required: ['locator'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({ locator: z.string().min(1) });
      return runTool(
        'get_server_health_item',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const response = await api.health.getSingleHealthItem(typed.locator);
          return json(response.data);
        },
        args
      );
    },
    mode: 'full',
  },

  // === Availability Policy Guard (read-only) ===
  {
    name: 'check_availability_guard',
    description:
      'Evaluate server health; returns ok=false if critical health items found (severity ERROR)',
    inputSchema: {
      type: 'object',
      properties: {
        failOnWarning: {
          type: 'boolean',
          description: 'Treat warnings as failures (default false)',
        },
      },
    },
    handler: async (args: unknown) => {
      const schema = z.object({ failOnWarning: z.boolean().optional() });
      return runTool(
        'check_availability_guard',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const resp = await api.health.getHealthItems();
          const items = (resp.data?.healthItem ?? []) as Array<{
            severity?: 'ERROR' | 'WARNING' | 'INFO' | string;
            id?: string;
            category?: string;
            additionalData?: unknown;
            href?: string;
            text?: string;
          }>;
          const critical = items.filter((i) => i.severity === 'ERROR');
          const warnings = items.filter((i) => i.severity === 'WARNING');
          const ok = critical.length === 0 && (!typed.failOnWarning || warnings.length === 0);
          return json({ ok, criticalCount: critical.length, warningCount: warnings.length, items });
        },
        args
      );
    },
  },

  // === Agent Compatibility (read-only lookups) ===
  {
    name: 'get_compatible_build_types_for_agent',
    description: 'Get build types compatible with the specified agent',
    inputSchema: {
      type: 'object',
      properties: { agentId: { type: 'string', description: 'Agent ID' } },
      required: ['agentId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({ agentId: z.string().min(1) });
      return runTool(
        'get_compatible_build_types_for_agent',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const resp = await api.agents.getCompatibleBuildTypes(typed.agentId);
          return json(resp.data);
        },
        args
      );
    },
  },
  {
    name: 'get_incompatible_build_types_for_agent',
    description: 'Get build types incompatible with the specified agent',
    inputSchema: {
      type: 'object',
      properties: { agentId: { type: 'string', description: 'Agent ID' } },
      required: ['agentId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({ agentId: z.string().min(1) });
      return runTool(
        'get_incompatible_build_types_for_agent',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const resp = await api.agents.getIncompatibleBuildTypes(typed.agentId);
          return json(resp.data);
        },
        args
      );
    },
  },
  {
    name: 'get_agent_enabled_info',
    description: 'Get the enabled/disabled state for an agent, including comment and switch time',
    inputSchema: {
      type: 'object',
      properties: { agentId: { type: 'string', description: 'Agent ID' } },
      required: ['agentId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({ agentId: z.string().min(1) });
      return runTool(
        'get_agent_enabled_info',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const resp = await api.agents.getEnabledInfo(typed.agentId);
          return json(resp.data);
        },
        args
      );
    },
  },
  {
    name: 'get_compatible_agents_for_build_type',
    description: 'List agents compatible with a build type (optionally filter enabled only)',
    inputSchema: {
      type: 'object',
      properties: {
        buildTypeId: { type: 'string', description: 'Build type ID' },
        includeDisabled: {
          type: 'boolean',
          description: 'Include disabled agents (default false)',
        },
      },
      required: ['buildTypeId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        buildTypeId: z.string().min(1),
        includeDisabled: z.boolean().optional(),
      });
      return runTool(
        'get_compatible_agents_for_build_type',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const filters = [`compatible:(buildType:${typed.buildTypeId})`];
          if (!typed.includeDisabled) filters.push('enabled:true');
          const locator = filters.join(',');
          const resp = await api.agents.getAllAgents(locator);
          return json(resp.data);
        },
        args
      );
    },
  },
  {
    name: 'count_compatible_agents_for_build_type',
    description: 'Return only the count of enabled compatible agents for a build type',
    inputSchema: {
      type: 'object',
      properties: {
        buildTypeId: { type: 'string', description: 'Build type ID' },
        includeDisabled: {
          type: 'boolean',
          description: 'Include disabled agents (default false)',
        },
      },
      required: ['buildTypeId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        buildTypeId: z.string().min(1),
        includeDisabled: z.boolean().optional(),
      });
      return runTool(
        'count_compatible_agents_for_build_type',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const parts = [`compatible:(buildType:${typed.buildTypeId})`];
          if (!typed.includeDisabled) parts.push('enabled:true');
          const locator = parts.join(',');
          const resp = await api.agents.getAllAgents(locator, 'count');
          const count = (resp.data as { count?: number }).count ?? 0;
          return json({ count });
        },
        args
      );
    },
  },
  {
    name: 'get_compatible_agents_for_queued_build',
    description:
      'List agents compatible with a queued/running build by buildId (optionally filter enabled only)',
    inputSchema: {
      type: 'object',
      properties: {
        buildId: { type: 'string', description: 'Build ID' },
        includeDisabled: {
          type: 'boolean',
          description: 'Include disabled agents (default false)',
        },
      },
      required: ['buildId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        buildId: z.string().min(1),
        includeDisabled: z.boolean().optional(),
      });
      return runTool(
        'get_compatible_agents_for_queued_build',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const build = await api.getBuild(typed.buildId);
          const buildTypeId = (build as { buildTypeId?: string }).buildTypeId;
          if (!buildTypeId) return json({ items: [], count: 0, note: 'Build type ID not found' });
          const parts = [`compatible:(buildType:${buildTypeId})`];
          if (!typed.includeDisabled) parts.push('enabled:true');
          const locator = parts.join(',');
          const resp = await api.agents.getAllAgents(locator);
          return json(resp.data);
        },
        args
      );
    },
  },
  {
    name: 'check_teamcity_connection',
    description: 'Check connectivity to TeamCity server and basic readiness',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_args: unknown) => {
      const ok = await TeamCityAPI.getInstance().testConnection();
      return json({ ok });
    },
  },

  // === Agent Tools ===
  {
    name: 'list_agents',
    description: 'List build agents (supports pagination)',
    inputSchema: {
      type: 'object',
      properties: {
        locator: { type: 'string', description: 'Optional agent locator to filter' },
        pageSize: { type: 'number', description: 'Items per page (default 100)' },
        maxPages: { type: 'number', description: 'Max pages to fetch (when all=true)' },
        all: { type: 'boolean', description: 'Fetch all pages up to maxPages' },
        fields: {
          type: 'string',
          description: 'Optional fields selector for server-side projection',
        },
      },
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        locator: z.string().min(1).optional(),
        pageSize: z.number().int().min(1).max(1000).optional(),
        maxPages: z.number().int().min(1).max(1000).optional(),
        all: z.boolean().optional(),
        fields: z.string().min(1).optional(),
      });
      return runTool(
        'list_agents',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const pageSize = typed.pageSize ?? 100;
          const baseFetch = async ({ count, start }: { count?: number; start?: number }) => {
            const parts: string[] = [];
            if (typed.locator) parts.push(typed.locator);
            if (typeof count === 'number') parts.push(`count:${count}`);
            if (typeof start === 'number') parts.push(`start:${start}`);
            const locator = parts.length > 0 ? parts.join(',') : undefined;
            return api.agents.getAllAgents(locator as string | undefined, typed.fields);
          };

          const fetcher = createPaginatedFetcher(
            baseFetch,
            (response: unknown) => {
              const data = response as { agent?: unknown[]; count?: number };
              return Array.isArray(data.agent) ? (data.agent as unknown[]) : [];
            },
            (response: unknown) => {
              const data = response as { count?: number };
              return typeof data.count === 'number' ? data.count : undefined;
            }
          );

          if (typed.all) {
            const items = await fetchAllPages(fetcher, { pageSize, maxPages: typed.maxPages });
            return json({ items, pagination: { mode: 'all', pageSize, fetched: items.length } });
          }

          const firstPage = await fetcher({ count: pageSize, start: 0 });
          return json({ items: firstPage.items, pagination: { page: 1, pageSize } });
        },
        args
      );
    },
  },

  {
    name: 'list_agent_pools',
    description: 'List agent pools (supports pagination)',
    inputSchema: {
      type: 'object',
      properties: {
        pageSize: { type: 'number', description: 'Items per page (default 100)' },
        maxPages: { type: 'number', description: 'Max pages to fetch (when all=true)' },
        all: { type: 'boolean', description: 'Fetch all pages up to maxPages' },
        fields: {
          type: 'string',
          description: 'Optional fields selector for server-side projection',
        },
      },
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        pageSize: z.number().int().min(1).max(1000).optional(),
        maxPages: z.number().int().min(1).max(1000).optional(),
        all: z.boolean().optional(),
        fields: z.string().min(1).optional(),
      });
      return runTool(
        'list_agent_pools',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const pageSize = typed.pageSize ?? 100;
          const baseFetch = async ({ count, start }: { count?: number; start?: number }) => {
            const parts: string[] = [];
            if (typeof count === 'number') parts.push(`count:${count}`);
            if (typeof start === 'number') parts.push(`start:${start}`);
            const locator = parts.length > 0 ? parts.join(',') : undefined;
            return api.agentPools.getAllAgentPools(locator as string | undefined, typed.fields);
          };

          const fetcher = createPaginatedFetcher(
            baseFetch,
            (response: unknown) => {
              const data = response as { agentPool?: unknown[]; count?: number };
              return Array.isArray(data.agentPool) ? (data.agentPool as unknown[]) : [];
            },
            (response: unknown) => {
              const data = response as { count?: number };
              return typeof data.count === 'number' ? data.count : undefined;
            }
          );

          if (typed.all) {
            const items = await fetchAllPages(fetcher, { pageSize, maxPages: typed.maxPages });
            return json({ items, pagination: { mode: 'all', pageSize, fetched: items.length } });
          }

          const firstPage = await fetcher({ count: pageSize, start: 0 });
          return json({ items: firstPage.items, pagination: { page: 1, pageSize } });
        },
        args
      );
    },
  },

  // === Additional Tools from Complex Implementation ===

  // Build Analysis Tools
  {
    name: 'get_build_results',
    description:
      'Get detailed results of a build including tests, artifacts, changes, and statistics',
    inputSchema: {
      type: 'object',
      properties: {
        buildId: { type: 'string', description: 'Build ID' },
        includeArtifacts: {
          type: 'boolean',
          description: 'Include artifacts listing and metadata',
        },
        includeStatistics: { type: 'boolean', description: 'Include build statistics' },
        includeChanges: { type: 'boolean', description: 'Include VCS changes' },
        includeDependencies: { type: 'boolean', description: 'Include dependency builds' },
        artifactFilter: { type: 'string', description: 'Filter artifacts by name/path pattern' },
        maxArtifactSize: {
          type: 'number',
          description: 'Max artifact content size (bytes) when inlining',
        },
      },
      required: ['buildId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        buildId: z.string().min(1),
        includeArtifacts: z.boolean().optional(),
        includeStatistics: z.boolean().optional(),
        includeChanges: z.boolean().optional(),
        includeDependencies: z.boolean().optional(),
        artifactFilter: z.string().min(1).optional(),
        maxArtifactSize: z.number().int().min(1).optional(),
      });

      return runTool(
        'get_build_results',
        schema,
        async (typed) => {
          // Use the manager for rich results via the unified TeamCityAPI adapter.
          const api = TeamCityAPI.getInstance();
          const manager = new BuildResultsManager(createAdapterFromTeamCityAPI(api));
          const result = await manager.getBuildResults(typed.buildId, {
            includeArtifacts: typed.includeArtifacts,
            includeStatistics: typed.includeStatistics,
            includeChanges: typed.includeChanges,
            includeDependencies: typed.includeDependencies,
            artifactFilter: typed.artifactFilter,
            maxArtifactSize: typed.maxArtifactSize,
          });
          return json(result);
        },
        args
      );
    },
  },

  {
    name: 'get_test_details',
    description: 'Get detailed information about test failures',
    inputSchema: {
      type: 'object',
      properties: {
        buildId: { type: 'string', description: 'Build ID' },
        testNameId: { type: 'string', description: 'Test name ID (optional)' },
      },
      required: ['buildId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        buildId: z.string().min(1),
        testNameId: z.string().min(1).optional(),
      });
      return runTool(
        'get_test_details',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          let locator = `build:(id:${typed.buildId})`;
          if (typed.testNameId) locator += `,test:(id:${typed.testNameId})`;
          const response = await api.tests.getAllTestOccurrences(locator);
          return json(response.data);
        },
        args
      );
    },
  },

  {
    name: 'analyze_build_problems',
    description: 'Analyze and report build problems and failures',
    inputSchema: {
      type: 'object',
      properties: {
        buildId: { type: 'string', description: 'Build ID to analyze' },
      },
      required: ['buildId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({ buildId: z.string().min(1) });
      return runTool(
        'analyze_build_problems',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const build = await api.getBuild(typed.buildId);
          const problems = await api.builds.getBuildProblems(`id:${typed.buildId}`);
          const failures = await api.listTestFailures(typed.buildId);
          return json({
            buildStatus: build.status,
            statusText: build.statusText,
            problems: problems.data,
            testFailures: failures,
          });
        },
        args
      );
    },
  },

  // === Changes, Problems & Diagnostics ===
  {
    name: 'list_changes',
    description: 'List VCS changes (supports pagination)',
    inputSchema: {
      type: 'object',
      properties: {
        locator: { type: 'string', description: 'Optional change locator to filter results' },
        projectId: { type: 'string', description: 'Filter by project ID via locator helper' },
        buildId: { type: 'string', description: 'Filter by build ID via locator helper' },
        pageSize: { type: 'number', description: 'Items per page (default 100)' },
        maxPages: { type: 'number', description: 'Max pages to fetch (when all=true)' },
        all: { type: 'boolean', description: 'Fetch all pages up to maxPages' },
        fields: {
          type: 'string',
          description: 'Optional fields selector for server-side projection',
        },
      },
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        locator: z.string().min(1).optional(),
        projectId: z.string().min(1).optional(),
        buildId: z.string().min(1).optional(),
        pageSize: z.number().int().min(1).max(1000).optional(),
        maxPages: z.number().int().min(1).max(1000).optional(),
        all: z.boolean().optional(),
        fields: z.string().min(1).optional(),
      });
      return runTool(
        'list_changes',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const baseParts: string[] = [];
          if (typed.locator) baseParts.push(typed.locator);
          if (typed.projectId) baseParts.push(`project:(id:${typed.projectId})`);
          if (typed.buildId) baseParts.push(`build:(id:${typed.buildId})`);

          const pageSize = typed.pageSize ?? 100;
          const baseFetch = async ({ count, start }: { count?: number; start?: number }) => {
            const parts = [...baseParts];
            if (typeof count === 'number') parts.push(`count:${count}`);
            if (typeof start === 'number') parts.push(`start:${start}`);
            const locator = parts.length > 0 ? parts.join(',') : undefined;
            return api.changes.getAllChanges(locator as string | undefined, typed.fields);
          };

          const fetcher = createPaginatedFetcher(
            baseFetch,
            (response: unknown) => {
              const data = response as { change?: unknown[]; count?: number };
              return Array.isArray(data.change) ? (data.change as unknown[]) : [];
            },
            (response: unknown) => {
              const data = response as { count?: number };
              return typeof data.count === 'number' ? data.count : undefined;
            }
          );

          if (typed.all) {
            const items = await fetchAllPages(fetcher, { pageSize, maxPages: typed.maxPages });
            return json({ items, pagination: { mode: 'all', pageSize, fetched: items.length } });
          }

          const firstPage = await fetcher({ count: pageSize, start: 0 });
          return json({ items: firstPage.items, pagination: { page: 1, pageSize } });
        },
        args
      );
    },
  },

  {
    name: 'list_problems',
    description: 'List build problems (supports pagination)',
    inputSchema: {
      type: 'object',
      properties: {
        locator: { type: 'string', description: 'Optional problem locator to filter results' },
        projectId: { type: 'string', description: 'Filter by project ID via locator helper' },
        buildId: { type: 'string', description: 'Filter by build ID via locator helper' },
        pageSize: { type: 'number', description: 'Items per page (default 100)' },
        maxPages: { type: 'number', description: 'Max pages to fetch (when all=true)' },
        all: { type: 'boolean', description: 'Fetch all pages up to maxPages' },
        fields: {
          type: 'string',
          description: 'Optional fields selector for server-side projection',
        },
      },
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        locator: z.string().min(1).optional(),
        projectId: z.string().min(1).optional(),
        buildId: z.string().min(1).optional(),
        pageSize: z.number().int().min(1).max(1000).optional(),
        maxPages: z.number().int().min(1).max(1000).optional(),
        all: z.boolean().optional(),
        fields: z.string().min(1).optional(),
      });
      return runTool(
        'list_problems',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const baseParts: string[] = [];
          if (typed.locator) baseParts.push(typed.locator);
          if (typed.projectId) baseParts.push(`project:(id:${typed.projectId})`);
          if (typed.buildId) baseParts.push(`build:(id:${typed.buildId})`);

          const pageSize = typed.pageSize ?? 100;
          const baseFetch = async ({ count, start }: { count?: number; start?: number }) => {
            const parts = [...baseParts];
            if (typeof count === 'number') parts.push(`count:${count}`);
            if (typeof start === 'number') parts.push(`start:${start}`);
            const locator = parts.length > 0 ? parts.join(',') : undefined;
            return api.problems.getAllBuildProblems(locator as string | undefined, typed.fields);
          };

          const fetcher = createPaginatedFetcher(
            baseFetch,
            (response: unknown) => {
              const data = response as { problem?: unknown[]; count?: number };
              return Array.isArray(data.problem) ? (data.problem as unknown[]) : [];
            },
            (response: unknown) => {
              const data = response as { count?: number };
              return typeof data.count === 'number' ? data.count : undefined;
            }
          );

          if (typed.all) {
            const items = await fetchAllPages(fetcher, { pageSize, maxPages: typed.maxPages });
            return json({ items, pagination: { mode: 'all', pageSize, fetched: items.length } });
          }

          const firstPage = await fetcher({ count: pageSize, start: 0 });
          return json({ items: firstPage.items, pagination: { page: 1, pageSize } });
        },
        args
      );
    },
  },

  {
    name: 'list_problem_occurrences',
    description: 'List problem occurrences (supports pagination)',
    inputSchema: {
      type: 'object',
      properties: {
        locator: {
          type: 'string',
          description: 'Optional problem occurrence locator to filter results',
        },
        buildId: { type: 'string', description: 'Filter by build ID via locator helper' },
        problemId: {
          type: 'string',
          description: 'Filter by problem ID via locator helper',
        },
        pageSize: { type: 'number', description: 'Items per page (default 100)' },
        maxPages: { type: 'number', description: 'Max pages to fetch (when all=true)' },
        all: { type: 'boolean', description: 'Fetch all pages up to maxPages' },
        fields: {
          type: 'string',
          description: 'Optional fields selector for server-side projection',
        },
      },
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        locator: z.string().min(1).optional(),
        buildId: z.string().min(1).optional(),
        problemId: z.string().min(1).optional(),
        pageSize: z.number().int().min(1).max(1000).optional(),
        maxPages: z.number().int().min(1).max(1000).optional(),
        all: z.boolean().optional(),
        fields: z.string().min(1).optional(),
      });
      return runTool(
        'list_problem_occurrences',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const baseParts: string[] = [];
          if (typed.locator) baseParts.push(typed.locator);
          if (typed.buildId) baseParts.push(`build:(id:${typed.buildId})`);
          if (typed.problemId) baseParts.push(`problem:(id:${typed.problemId})`);

          const pageSize = typed.pageSize ?? 100;
          const baseFetch = async ({ count, start }: { count?: number; start?: number }) => {
            const parts = [...baseParts];
            if (typeof count === 'number') parts.push(`count:${count}`);
            if (typeof start === 'number') parts.push(`start:${start}`);
            const locator = parts.length > 0 ? parts.join(',') : undefined;
            return api.problemOccurrences.getAllBuildProblemOccurrences(
              locator as string | undefined,
              typed.fields
            );
          };

          const fetcher = createPaginatedFetcher(
            baseFetch,
            (response: unknown) => {
              const data = response as { problemOccurrence?: unknown[]; count?: number };
              return Array.isArray(data.problemOccurrence)
                ? (data.problemOccurrence as unknown[])
                : [];
            },
            (response: unknown) => {
              const data = response as { count?: number };
              return typeof data.count === 'number' ? data.count : undefined;
            }
          );

          if (typed.all) {
            const items = await fetchAllPages(fetcher, { pageSize, maxPages: typed.maxPages });
            return json({ items, pagination: { mode: 'all', pageSize, fetched: items.length } });
          }

          const firstPage = await fetcher({ count: pageSize, start: 0 });
          return json({ items: firstPage.items, pagination: { page: 1, pageSize } });
        },
        args
      );
    },
  },

  {
    name: 'list_investigations',
    description: 'List open investigations (supports pagination)',
    inputSchema: {
      type: 'object',
      properties: {
        locator: {
          type: 'string',
          description: 'Optional investigation locator to filter results',
        },
        projectId: { type: 'string', description: 'Filter by project ID via locator helper' },
        buildTypeId: {
          type: 'string',
          description: 'Filter by build configuration ID via locator helper',
        },
        assigneeUsername: {
          type: 'string',
          description: 'Filter by responsible user username via locator helper',
        },
        pageSize: { type: 'number', description: 'Items per page (default 100)' },
        maxPages: { type: 'number', description: 'Max pages to fetch (when all=true)' },
        all: { type: 'boolean', description: 'Fetch all pages up to maxPages' },
        fields: {
          type: 'string',
          description: 'Optional fields selector for server-side projection',
        },
      },
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        locator: z.string().min(1).optional(),
        projectId: z.string().min(1).optional(),
        buildTypeId: z.string().min(1).optional(),
        assigneeUsername: z.string().min(1).optional(),
        pageSize: z.number().int().min(1).max(1000).optional(),
        maxPages: z.number().int().min(1).max(1000).optional(),
        all: z.boolean().optional(),
        fields: z.string().min(1).optional(),
      });
      return runTool(
        'list_investigations',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const baseParts: string[] = [];
          if (typed.locator) baseParts.push(typed.locator);
          if (typed.projectId) baseParts.push(`project:(id:${typed.projectId})`);
          if (typed.buildTypeId) baseParts.push(`buildType:(id:${typed.buildTypeId})`);
          if (typed.assigneeUsername)
            baseParts.push(`responsible:(user:(username:${typed.assigneeUsername}))`);

          const pageSize = typed.pageSize ?? 100;
          const baseFetch = async ({ count, start }: { count?: number; start?: number }) => {
            const parts = [...baseParts];
            if (typeof count === 'number') parts.push(`count:${count}`);
            if (typeof start === 'number') parts.push(`start:${start}`);
            const locator = parts.length > 0 ? parts.join(',') : undefined;
            return api.investigations.getAllInvestigations(
              locator as string | undefined,
              typed.fields
            );
          };

          const fetcher = createPaginatedFetcher(
            baseFetch,
            (response: unknown) => {
              const data = response as { investigation?: unknown[]; count?: number };
              return Array.isArray(data.investigation) ? (data.investigation as unknown[]) : [];
            },
            (response: unknown) => {
              const data = response as { count?: number };
              return typeof data.count === 'number' ? data.count : undefined;
            }
          );

          if (typed.all) {
            const items = await fetchAllPages(fetcher, { pageSize, maxPages: typed.maxPages });
            return json({ items, pagination: { mode: 'all', pageSize, fetched: items.length } });
          }

          const firstPage = await fetcher({ count: pageSize, start: 0 });
          return json({ items: firstPage.items, pagination: { page: 1, pageSize } });
        },
        args
      );
    },
  },

  {
    name: 'list_muted_tests',
    description: 'List muted tests (supports pagination)',
    inputSchema: {
      type: 'object',
      properties: {
        locator: { type: 'string', description: 'Optional mute locator to filter results' },
        projectId: { type: 'string', description: 'Filter by project ID via locator helper' },
        buildTypeId: {
          type: 'string',
          description: 'Filter by build configuration ID via locator helper',
        },
        testNameId: { type: 'string', description: 'Filter by test name ID via locator helper' },
        pageSize: { type: 'number', description: 'Items per page (default 100)' },
        maxPages: { type: 'number', description: 'Max pages to fetch (when all=true)' },
        all: { type: 'boolean', description: 'Fetch all pages up to maxPages' },
        fields: {
          type: 'string',
          description: 'Optional fields selector for server-side projection',
        },
      },
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        locator: z.string().min(1).optional(),
        projectId: z.string().min(1).optional(),
        buildTypeId: z.string().min(1).optional(),
        testNameId: z.string().min(1).optional(),
        pageSize: z.number().int().min(1).max(1000).optional(),
        maxPages: z.number().int().min(1).max(1000).optional(),
        all: z.boolean().optional(),
        fields: z.string().min(1).optional(),
      });
      return runTool(
        'list_muted_tests',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const baseParts: string[] = [];
          if (typed.locator) baseParts.push(typed.locator);
          if (typed.projectId) baseParts.push(`project:(id:${typed.projectId})`);
          if (typed.buildTypeId) baseParts.push(`buildType:(id:${typed.buildTypeId})`);
          if (typed.testNameId) baseParts.push(`test:(id:${typed.testNameId})`);

          const pageSize = typed.pageSize ?? 100;
          const baseFetch = async ({ count, start }: { count?: number; start?: number }) => {
            const parts = [...baseParts];
            if (typeof count === 'number') parts.push(`count:${count}`);
            if (typeof start === 'number') parts.push(`start:${start}`);
            const locator = parts.length > 0 ? parts.join(',') : undefined;
            return api.mutes.getAllMutedTests(locator as string | undefined, typed.fields);
          };

          const fetcher = createPaginatedFetcher(
            baseFetch,
            (response: unknown) => {
              const data = response as { mute?: unknown[]; count?: number };
              return Array.isArray(data.mute) ? (data.mute as unknown[]) : [];
            },
            (response: unknown) => {
              const data = response as { count?: number };
              return typeof data.count === 'number' ? data.count : undefined;
            }
          );

          if (typed.all) {
            const items = await fetchAllPages(fetcher, { pageSize, maxPages: typed.maxPages });
            return json({ items, pagination: { mode: 'all', pageSize, fetched: items.length } });
          }

          const firstPage = await fetcher({ count: pageSize, start: 0 });
          return json({ items: firstPage.items, pagination: { page: 1, pageSize } });
        },
        args
      );
    },
  },

  {
    name: 'get_versioned_settings_status',
    description: 'Get Versioned Settings status for a locator',
    inputSchema: {
      type: 'object',
      properties: {
        locator: {
          type: 'string',
          description: 'Locator identifying a project/buildType for Versioned Settings',
        },
        fields: {
          type: 'string',
          description: 'Optional fields selector for server-side projection',
        },
      },
      required: ['locator'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        locator: z.string().min(1),
        fields: z.string().min(1).optional(),
      });
      return runTool(
        'get_versioned_settings_status',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const response = await api.versionedSettings.getVersionedSettingsStatus(
            typed.locator,
            typed.fields
          );
          return json(response.data);
        },
        args
      );
    },
  },

  {
    name: 'list_users',
    description: 'List TeamCity users (supports pagination)',
    inputSchema: {
      type: 'object',
      properties: {
        locator: { type: 'string', description: 'Optional user locator to filter results' },
        groupId: { type: 'string', description: 'Filter by group ID via locator helper' },
        pageSize: { type: 'number', description: 'Items per page (default 100)' },
        maxPages: { type: 'number', description: 'Max pages to fetch (when all=true)' },
        all: { type: 'boolean', description: 'Fetch all pages up to maxPages' },
        fields: {
          type: 'string',
          description: 'Optional fields selector for server-side projection',
        },
      },
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        locator: z.string().min(1).optional(),
        groupId: z.string().min(1).optional(),
        pageSize: z.number().int().min(1).max(1000).optional(),
        maxPages: z.number().int().min(1).max(1000).optional(),
        all: z.boolean().optional(),
        fields: z.string().min(1).optional(),
      });
      return runTool(
        'list_users',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const baseParts: string[] = [];
          if (typed.locator) baseParts.push(typed.locator);
          if (typed.groupId) baseParts.push(`group:(id:${typed.groupId})`);

          const pageSize = typed.pageSize ?? 100;
          const baseFetch = async ({ count, start }: { count?: number; start?: number }) => {
            const parts = [...baseParts];
            if (typeof count === 'number') parts.push(`count:${count}`);
            if (typeof start === 'number') parts.push(`start:${start}`);
            const locator = parts.length > 0 ? parts.join(',') : undefined;
            return api.users.getAllUsers(locator as string | undefined, typed.fields);
          };

          const fetcher = createPaginatedFetcher(
            baseFetch,
            (response: unknown) => {
              const data = response as { user?: unknown[]; count?: number };
              return Array.isArray(data.user) ? (data.user as unknown[]) : [];
            },
            (response: unknown) => {
              const data = response as { count?: number };
              return typeof data.count === 'number' ? data.count : undefined;
            }
          );

          if (typed.all) {
            const items = await fetchAllPages(fetcher, { pageSize, maxPages: typed.maxPages });
            return json({ items, pagination: { mode: 'all', pageSize, fetched: items.length } });
          }

          const firstPage = await fetcher({ count: pageSize, start: 0 });
          return json({ items: firstPage.items, pagination: { page: 1, pageSize } });
        },
        args
      );
    },
  },

  {
    name: 'list_roles',
    description: 'List defined roles and their permissions',
    inputSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'string',
          description: 'Optional fields selector for server-side projection',
        },
      },
    },
    handler: async (args: unknown) => {
      const schema = z.object({ fields: z.string().min(1).optional() });
      return runTool(
        'list_roles',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const response = await api.roles.getRoles(typed.fields);
          const roles = (response.data?.role ?? []) as unknown[];
          return json({ items: roles, count: roles.length });
        },
        args
      );
    },
  },

  {
    name: 'list_branches',
    description: 'List branches for a project or build configuration',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        buildTypeId: { type: 'string', description: 'Build type ID' },
      },
    },
    handler: async (args: unknown) => {
      const schema = z
        .object({
          projectId: z.string().min(1).optional(),
          buildTypeId: z.string().min(1).optional(),
        })
        .refine((v) => Boolean(v.projectId ?? v.buildTypeId), {
          message: 'Either projectId or buildTypeId is required',
          path: ['projectId'],
        });
      return runTool(
        'list_branches',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const locator = typed.buildTypeId
            ? `buildType:(id:${typed.buildTypeId})`
            : `project:(id:${typed.projectId})`;

          const builds = (await api.listBuilds(`${locator},count:100}`)) as {
            build?: Array<{ branchName?: string | null }>; // minimal shape used
          };
          const items = Array.isArray(builds.build) ? builds.build : [];
          const branchNames = items
            .map((b) => b.branchName)
            .filter((n): n is string => typeof n === 'string' && n.length > 0);
          const branches = new Set(branchNames);
          return json({ branches: Array.from(branches), count: branches.size });
        },
        args
      );
    },
  },

  {
    name: 'list_parameters',
    description: 'List parameters for a build configuration',
    inputSchema: {
      type: 'object',
      properties: {
        buildTypeId: { type: 'string', description: 'Build type ID' },
      },
      required: ['buildTypeId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({ buildTypeId: z.string().min(1) });
      return runTool(
        'list_parameters',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const buildType = await api.getBuildType(typed.buildTypeId);
          return json({
            parameters: buildType.parameters?.property ?? [],
            count: buildType.parameters?.property?.length ?? 0,
          });
        },
        args
      );
    },
  },

  {
    name: 'list_project_hierarchy',
    description: 'List project hierarchy showing parent-child relationships',
    inputSchema: {
      type: 'object',
      properties: {
        rootProjectId: { type: 'string', description: 'Root project ID (defaults to _Root)' },
      },
    },
    handler: async (args: unknown) => {
      const schema = z.object({ rootProjectId: z.string().min(1).optional() });
      return runTool(
        'list_project_hierarchy',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const rootId = typed.rootProjectId ?? '_Root';

          type ApiProject = {
            id?: string;
            name?: string;
            parentProjectId?: string;
            projects?: { project?: unknown[] };
          };

          async function buildHierarchy(
            projectId: string,
            depth = 0
          ): Promise<{
            id?: string;
            name?: string;
            parentId?: string;
            children: Array<{ id: string; name?: string }>;
          }> {
            const response = await api.projects.getProject(projectId);
            const project = response.data as ApiProject;
            const children: Array<{ id: string; name?: string }> = [];

            const maybeChildren = project.projects?.project ?? [];
            if (Array.isArray(maybeChildren)) {
              for (const childRaw of maybeChildren) {
                const child = childRaw as { id?: string; name?: string };
                if (typeof child.id === 'string' && depth < 3) {
                  // eslint-disable-next-line no-await-in-loop
                  const sub = await buildHierarchy(child.id, depth + 1);
                  children.push({ id: sub.id ?? child.id, name: sub.name });
                } else if (typeof child.id === 'string') {
                  children.push({ id: child.id, name: child.name });
                }
              }
            }

            return {
              id: project.id,
              name: project.name,
              parentId: project.parentProjectId,
              children,
            };
          }

          const hierarchy = await buildHierarchy(rootId);
          return json(hierarchy);
        },
        args
      );
    },
  },
];

/**
 * Full mode tools - Write/modify operations (only in full mode)
 */
const FULL_MODE_TOOLS: ToolDefinition[] = [
  // === Project Management Tools ===
  {
    name: 'create_project',
    description: 'Create a new TeamCity project',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
        id: { type: 'string', description: 'Project ID' },
        parentProjectId: { type: 'string', description: 'Parent project ID (defaults to _Root)' },
        description: { type: 'string', description: 'Project description' },
      },
      required: ['name', 'id'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        name: z.string().min(1),
        id: z.string().min(1),
        description: z.string().optional(),
        parentProjectId: z.string().min(1).optional(),
      });
      return runTool(
        'create_project',
        schema,
        async (typedArgs) => {
          const api = TeamCityAPI.getInstance();
          const project = {
            name: typedArgs.name,
            id: typedArgs.id,
            parentProject: { id: typedArgs.parentProjectId ?? '_Root' },
            description: typedArgs.description,
          };
          const response = await api.projects.addProject(project, {
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          });
          return json({ success: true, action: 'create_project', id: response.data.id });
        },
        args
      );
    },
    mode: 'full',
  },

  {
    name: 'delete_project',
    description: 'Delete a TeamCity project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID to delete' },
      },
      required: ['projectId'],
    },
    handler: async (args: unknown) => {
      const typedArgs = args as DeleteProjectArgs;

      const api = TeamCityAPI.getInstance();
      await api.projects.deleteProject(typedArgs.projectId);
      return json({ success: true, action: 'delete_project', id: typedArgs.projectId });
    },
    mode: 'full',
  },

  {
    name: 'update_project_settings',
    description: 'Update project settings and parameters',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        name: { type: 'string', description: 'New project name' },
        description: { type: 'string', description: 'New project description' },
        archived: { type: 'boolean', description: 'Archive/unarchive project' },
      },
      required: ['projectId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        projectId: z.string().min(1),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        archived: z.boolean().optional(),
      });

      return runTool(
        'update_project_settings',
        schema,
        async (typedArgs) => {
          const api = TeamCityAPI.getInstance();

          // Emit debug info about requested changes (avoid logging secrets)
          debug('update_project_settings invoked', {
            projectId: typedArgs.projectId,
            // Only log which fields are present to reduce noise
            requestedChanges: {
              name: typeof typedArgs.name !== 'undefined',
              description: typeof typedArgs.description !== 'undefined',
              archived: typeof typedArgs.archived !== 'undefined',
            },
          });

          if (typedArgs.name) {
            debug('Setting project field', {
              projectId: typedArgs.projectId,
              field: 'name',
              valuePreview: typedArgs.name,
            });
            await api.projects.setProjectField(typedArgs.projectId, 'name', typedArgs.name);
          }
          if (typedArgs.description !== undefined) {
            debug('Setting project field', {
              projectId: typedArgs.projectId,
              field: 'description',
              valuePreview: typedArgs.description,
            });
            await api.projects.setProjectField(
              typedArgs.projectId,
              'description',
              typedArgs.description
            );
          }
          if (typedArgs.archived !== undefined) {
            debug('Setting project field', {
              projectId: typedArgs.projectId,
              field: 'archived',
              valuePreview: String(typedArgs.archived),
            });
            await api.projects.setProjectField(
              typedArgs.projectId,
              'archived',
              String(typedArgs.archived)
            );
          }

          debug('Project settings updated', {
            projectId: typedArgs.projectId,
            appliedChanges: {
              name: typedArgs.name ?? null,
              description: typedArgs.description ?? null,
              archived: typeof typedArgs.archived === 'boolean' ? typedArgs.archived : null,
            },
          });

          return json({
            success: true,
            action: 'update_project_settings',
            id: typedArgs.projectId,
          });
        },
        args
      );
    },
    mode: 'full',
  },

  // === Build Configuration Management ===
  {
    name: 'create_build_config',
    description: 'Create a new build configuration',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        name: { type: 'string', description: 'Build configuration name' },
        id: { type: 'string', description: 'Build configuration ID' },
        description: { type: 'string', description: 'Description' },
      },
      required: ['projectId', 'name', 'id'],
    },
    handler: async (args: unknown) => {
      const typedArgs = args as CreateBuildConfigArgs;

      const api = TeamCityAPI.getInstance();
      const buildType = {
        name: typedArgs.name,
        id: typedArgs.id,
        project: { id: typedArgs.projectId },
        description: typedArgs.description,
      };
      const response = await api.buildTypes.createBuildType(undefined, buildType, {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      return json({ success: true, action: 'create_build_config', id: response.data.id });
    },
    mode: 'full',
  },

  {
    name: 'clone_build_config',
    description: 'Clone an existing build configuration',
    inputSchema: {
      type: 'object',
      properties: {
        sourceBuildTypeId: { type: 'string', description: 'Source build type ID' },
        name: { type: 'string', description: 'New build configuration name' },
        id: { type: 'string', description: 'New build configuration ID' },
        projectId: { type: 'string', description: 'Target project ID' },
      },
      required: ['sourceBuildTypeId', 'name', 'id'],
    },
    handler: async (args: unknown) => {
      const typedArgs = args as CloneBuildConfigArgs;

      const api = TeamCityAPI.getInstance();
      // Get source build type
      const source = await api.getBuildType(typedArgs.sourceBuildTypeId);

      // Create new build type based on source
      const buildType = {
        ...source,
        name: typedArgs.name,
        id: typedArgs.id,
        project: { id: typedArgs.projectId ?? source.project?.id ?? '_Root' },
      };

      const response = await api.buildTypes.createBuildType(undefined, buildType);
      return json({ success: true, action: 'clone_build_config', id: response.data.id });
    },
    mode: 'full',
  },

  {
    name: 'update_build_config',
    description: 'Update build configuration settings',
    inputSchema: {
      type: 'object',
      properties: {
        buildTypeId: { type: 'string', description: 'Build type ID' },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'New description' },
        paused: { type: 'boolean', description: 'Pause/unpause configuration' },
        artifactRules: { type: 'string', description: 'Artifact rules' },
      },
      required: ['buildTypeId'],
    },
    handler: async (args: unknown) => {
      const typedArgs = args as UpdateBuildConfigArgs;

      const api = TeamCityAPI.getInstance();

      // Prefer the richer BuildConfigurationUpdateManager for settings + metadata.
      // Fallback to direct field updates if retrieval is unavailable (e.g., in tests with shallow mocks).
      try {
        const clientLike = { buildTypes: api.buildTypes } as unknown as TeamCityClient;
        const manager = new BuildConfigurationUpdateManager(clientLike);

        const current = await manager.retrieveConfiguration(typedArgs.buildTypeId);
        if (current) {
          const updates: { name?: string; description?: string; artifactRules?: string } = {};
          if (typedArgs.name != null && typedArgs.name !== '') updates.name = typedArgs.name;
          if (typedArgs.description !== undefined) updates.description = typedArgs.description;
          if (typedArgs.artifactRules !== undefined)
            updates.artifactRules = typedArgs.artifactRules;

          if (Object.keys(updates).length > 0) {
            await manager.validateUpdates(current, updates as never);
            await manager.applyUpdates(current, updates as never);
          }
        } else {
          // No current config available; fall back to direct field updates
          if (typedArgs.name != null && typedArgs.name !== '') {
            await api.buildTypes.setBuildTypeField(typedArgs.buildTypeId, 'name', typedArgs.name);
          }
          if (typedArgs.description !== undefined) {
            await api.buildTypes.setBuildTypeField(
              typedArgs.buildTypeId,
              'description',
              typedArgs.description
            );
          }
          if (typedArgs.artifactRules !== undefined) {
            await api.buildTypes.setBuildTypeField(
              typedArgs.buildTypeId,
              'settings/artifactRules',
              typedArgs.artifactRules
            );
          }
        }
      } catch {
        // Fallback path if manager cannot be used (e.g., getBuildType not mocked)
        if (typedArgs.name != null && typedArgs.name !== '') {
          await api.buildTypes.setBuildTypeField(typedArgs.buildTypeId, 'name', typedArgs.name);
        }
        if (typedArgs.description !== undefined) {
          await api.buildTypes.setBuildTypeField(
            typedArgs.buildTypeId,
            'description',
            typedArgs.description
          );
        }
        if (typedArgs.artifactRules !== undefined) {
          await api.buildTypes.setBuildTypeField(
            typedArgs.buildTypeId,
            'settings/artifactRules',
            typedArgs.artifactRules
          );
        }
      }

      // Handle paused separately (not part of UpdateManager options)
      if (typedArgs.paused !== undefined) {
        await api.buildTypes.setBuildTypeField(
          typedArgs.buildTypeId,
          'paused',
          String(typedArgs.paused)
        );
      }

      return json({ success: true, action: 'update_build_config', id: typedArgs.buildTypeId });
    },
    mode: 'full',
  },

  // === VCS attachment ===
  {
    name: 'add_vcs_root_to_build',
    description: 'Attach a VCS root to a build configuration',
    inputSchema: {
      type: 'object',
      properties: {
        buildTypeId: { type: 'string', description: 'Build type ID' },
        vcsRootId: { type: 'string', description: 'VCS root ID' },
        checkoutRules: { type: 'string', description: 'Optional checkout rules' },
      },
      required: ['buildTypeId', 'vcsRootId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        buildTypeId: z.string().min(1),
        vcsRootId: z.string().min(1),
        checkoutRules: z.string().optional(),
      });
      return runTool(
        'add_vcs_root_to_build',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const body = {
            'vcs-root': { id: typed.vcsRootId },
            'checkout-rules': typed.checkoutRules,
          } as Record<string, unknown>;
          await api.buildTypes.addVcsRootToBuildType(typed.buildTypeId, undefined, body, {
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          });
          return json({
            success: true,
            action: 'add_vcs_root_to_build',
            buildTypeId: typed.buildTypeId,
            vcsRootId: typed.vcsRootId,
          });
        },
        args
      );
    },
    mode: 'full',
  },

  // === Parameter Management ===
  {
    name: 'add_parameter',
    description: 'Add a parameter to a build configuration',
    inputSchema: {
      type: 'object',
      properties: {
        buildTypeId: { type: 'string', description: 'Build type ID' },
        name: { type: 'string', description: 'Parameter name' },
        value: { type: 'string', description: 'Parameter value' },
      },
      required: ['buildTypeId', 'name', 'value'],
    },
    handler: async (args: unknown) => {
      const typedArgs = args as AddParameterArgs;

      const api = TeamCityAPI.getInstance();
      const parameter = {
        name: typedArgs.name,
        value: typedArgs.value,
      };
      await api.buildTypes.createBuildParameterOfBuildType(
        typedArgs.buildTypeId,
        undefined,
        parameter,
        { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
      );
      return json({
        success: true,
        action: 'add_parameter',
        buildTypeId: typedArgs.buildTypeId,
        name: typedArgs.name,
      });
    },
    mode: 'full',
  },

  {
    name: 'update_parameter',
    description: 'Update a build configuration parameter',
    inputSchema: {
      type: 'object',
      properties: {
        buildTypeId: { type: 'string', description: 'Build type ID' },
        name: { type: 'string', description: 'Parameter name' },
        value: { type: 'string', description: 'New parameter value' },
      },
      required: ['buildTypeId', 'name', 'value'],
    },
    handler: async (args: unknown) => {
      const typedArgs = args as UpdateParameterArgs;

      const api = TeamCityAPI.getInstance();
      await api.buildTypes.updateBuildParameterOfBuildType(
        typedArgs.name,
        typedArgs.buildTypeId,
        undefined,
        {
          name: typedArgs.name,
          value: typedArgs.value,
        },
        { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
      );
      return json({
        success: true,
        action: 'update_parameter',
        buildTypeId: typedArgs.buildTypeId,
        name: typedArgs.name,
      });
    },
    mode: 'full',
  },

  {
    name: 'delete_parameter',
    description: 'Delete a parameter from a build configuration',
    inputSchema: {
      type: 'object',
      properties: {
        buildTypeId: { type: 'string', description: 'Build type ID' },
        name: { type: 'string', description: 'Parameter name' },
      },
      required: ['buildTypeId', 'name'],
    },
    handler: async (args: unknown) => {
      const typedArgs = args as DeleteParameterArgs;

      const api = TeamCityAPI.getInstance();
      await api.buildTypes.deleteBuildParameterOfBuildType_2(typedArgs.name, typedArgs.buildTypeId);
      return json({
        success: true,
        action: 'delete_parameter',
        buildTypeId: typedArgs.buildTypeId,
        name: typedArgs.name,
      });
    },
    mode: 'full',
  },

  // === VCS Root Management ===
  {
    name: 'create_vcs_root',
    description: 'Create a new VCS root',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        name: { type: 'string', description: 'VCS root name' },
        id: { type: 'string', description: 'VCS root ID' },
        vcsName: { type: 'string', description: 'VCS type (e.g., jetbrains.git)' },
        url: { type: 'string', description: 'Repository URL' },
        branch: { type: 'string', description: 'Default branch' },
      },
      required: ['projectId', 'name', 'id', 'vcsName', 'url'],
    },
    handler: async (args: unknown) => {
      const typedArgs = args as CreateVCSRootArgs;

      const api = TeamCityAPI.getInstance();
      const vcsRoot = {
        name: typedArgs.name,
        id: typedArgs.id,
        vcsName: typedArgs.vcsName,
        project: { id: typedArgs.projectId },
        properties: {
          property: [
            { name: 'url', value: typedArgs.url },
            { name: 'branch', value: typedArgs.branch ?? 'refs/heads/master' },
          ],
        },
      };
      const response = await api.vcsRoots.addVcsRoot(undefined, vcsRoot, {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      return json({ success: true, action: 'create_vcs_root', id: response.data.id });
    },
    mode: 'full',
  },

  // === Agent Management ===
  {
    name: 'authorize_agent',
    description: 'Authorize or unauthorize a build agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID' },
        authorize: { type: 'boolean', description: 'true to authorize, false to unauthorize' },
      },
      required: ['agentId', 'authorize'],
    },
    handler: async (args: unknown) => {
      const typedArgs = args as AuthorizeAgentArgs;

      const api = TeamCityAPI.getInstance();
      await api.agents.setAuthorizedInfo(
        typedArgs.agentId,
        undefined,
        { status: Boolean(typedArgs.authorize) },
        { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
      );
      return json({
        success: true,
        action: 'authorize_agent',
        agentId: typedArgs.agentId,
        authorized: typedArgs.authorize,
      });
    },
    mode: 'full',
  },

  {
    name: 'assign_agent_to_pool',
    description: 'Assign an agent to a different pool',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID' },
        poolId: { type: 'string', description: 'Agent pool ID' },
      },
      required: ['agentId', 'poolId'],
    },
    handler: async (args: unknown) => {
      const typedArgs = args as AssignAgentToPoolArgs;

      const api = TeamCityAPI.getInstance();
      await api.agents.setAgentPool(typedArgs.agentId, undefined, {
        id: parseInt(typedArgs.poolId),
      });
      return json({
        success: true,
        action: 'assign_agent_to_pool',
        agentId: typedArgs.agentId,
        poolId: typedArgs.poolId,
      });
    },
    mode: 'full',
  },

  // === Build Step Management ===
  {
    name: 'manage_build_steps',
    description: 'Add, update, or delete build steps',
    inputSchema: {
      type: 'object',
      properties: {
        buildTypeId: { type: 'string', description: 'Build type ID' },
        action: {
          type: 'string',
          enum: ['add', 'update', 'delete'],
          description: 'Action to perform',
        },
        stepId: { type: 'string', description: 'Step ID (for update/delete)' },
        name: { type: 'string', description: 'Step name' },
        type: { type: 'string', description: 'Step type (e.g., simpleRunner)' },
        properties: { type: 'object', description: 'Step properties' },
      },
      required: ['buildTypeId', 'action'],
    },
    handler: async (args: unknown) => {
      const typedArgs = args as ManageBuildStepsArgs;

      const api = TeamCityAPI.getInstance();

      switch (typedArgs.action) {
        case 'add': {
          const stepProps: Record<string, string> = Object.fromEntries(
            Object.entries(typedArgs.properties ?? {}).map(([k, v]) => [k, String(v)])
          );
          // Ensure command runner uses custom script when script.content is provided
          if (typedArgs.type === 'simpleRunner' && stepProps['script.content']) {
            stepProps['use.custom.script'] = stepProps['use.custom.script'] ?? 'true';
          }
          const step = {
            name: typedArgs.name,
            type: typedArgs.type,
            properties: {
              property: Object.entries(stepProps).map(([k, v]) => ({ name: k, value: v })),
            },
          };
          await api.buildTypes.addBuildStepToBuildType(typedArgs.buildTypeId, undefined, step, {
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          });
          return json({
            success: true,
            action: 'add_build_step',
            buildTypeId: typedArgs.buildTypeId,
          });
        }

        case 'update': {
          if (typedArgs.stepId == null || typedArgs.stepId === '') {
            return json({
              success: false,
              action: 'update_build_step',
              error: 'Step ID is required for update action',
            });
          }
          const props = Object.entries(typedArgs.properties ?? {});
          for (const [k, v] of props) {
            // eslint-disable-next-line no-await-in-loop
            await api.buildTypes.setBuildStepParameter(
              typedArgs.buildTypeId,
              typedArgs.stepId,
              k,
              String(v),
              { headers: { 'Content-Type': 'text/plain', Accept: 'application/json' } }
            );
          }
          return json({
            success: true,
            action: 'update_build_step',
            buildTypeId: typedArgs.buildTypeId,
            stepId: typedArgs.stepId,
          });
        }

        case 'delete':
          if (typedArgs.stepId == null || typedArgs.stepId === '') {
            return json({
              success: false,
              action: 'delete_build_step',
              error: 'Step ID is required for delete action',
            });
          }
          await api.buildTypes.deleteBuildStep(typedArgs.buildTypeId, typedArgs.stepId);
          return json({
            success: true,
            action: 'delete_build_step',
            buildTypeId: typedArgs.buildTypeId,
            stepId: typedArgs.stepId,
          });

        default:
          return json({ success: false, error: 'Invalid action' });
      }
    },
    mode: 'full',
  },

  // === Build Trigger Management ===
  {
    name: 'manage_build_triggers',
    description: 'Add, update, or delete build triggers',
    inputSchema: {
      type: 'object',
      properties: {
        buildTypeId: { type: 'string', description: 'Build type ID' },
        action: { type: 'string', enum: ['add', 'delete'], description: 'Action to perform' },
        triggerId: { type: 'string', description: 'Trigger ID (for delete)' },
        type: { type: 'string', description: 'Trigger type (e.g., vcsTrigger)' },
        properties: { type: 'object', description: 'Trigger properties' },
      },
      required: ['buildTypeId', 'action'],
    },
    handler: async (args: unknown) => {
      const typedArgs = args as ManageBuildTriggersArgs;

      const api = TeamCityAPI.getInstance();

      switch (typedArgs.action) {
        case 'add': {
          const trigger = {
            type: typedArgs.type,
            properties: {
              property: Object.entries(typedArgs.properties ?? {}).map(([k, v]) => ({
                name: k,
                value: String(v),
              })),
            },
          };
          await api.buildTypes.addTriggerToBuildType(typedArgs.buildTypeId, undefined, trigger, {
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          });
          return json({
            success: true,
            action: 'add_build_trigger',
            buildTypeId: typedArgs.buildTypeId,
          });
        }

        case 'delete':
          if (!typedArgs.triggerId) {
            return json({
              success: false,
              action: 'delete_build_trigger',
              error: 'Trigger ID is required for delete action',
            });
          }
          await api.buildTypes.deleteTrigger(typedArgs.buildTypeId, typedArgs.triggerId);
          return json({
            success: true,
            action: 'delete_build_trigger',
            buildTypeId: typedArgs.buildTypeId,
            triggerId: typedArgs.triggerId,
          });

        default:
          return json({ success: false, error: 'Invalid action' });
      }
    },
    mode: 'full',
  },

  // === Batch pause/unpause specific build configurations ===
  {
    name: 'set_build_configs_paused',
    description: 'Set paused/unpaused for a list of build configurations; optionally cancel queued',
    inputSchema: {
      type: 'object',
      properties: {
        buildTypeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of buildType IDs',
        },
        paused: { type: 'boolean', description: 'True to pause, false to unpause' },
        cancelQueued: { type: 'boolean', description: 'Cancel queued builds for these configs' },
      },
      required: ['buildTypeIds', 'paused'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        buildTypeIds: z.array(z.string().min(1)).min(1),
        paused: z.boolean(),
        cancelQueued: z.boolean().optional(),
      });
      return runTool(
        'set_build_configs_paused',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          let updated = 0;
          for (const id of typed.buildTypeIds) {
            // eslint-disable-next-line no-await-in-loop
            await api.buildTypes.setBuildTypeField(id, 'paused', String(typed.paused));
            updated += 1;
          }
          let canceled = 0;
          if (typed.cancelQueued) {
            const queue = await api.buildQueue.getAllQueuedBuilds();
            const builds = (queue.data?.build ?? []) as Array<{
              id?: number;
              buildTypeId?: string;
            }>;
            const ids = new Set(typed.buildTypeIds);
            const toCancel = builds.filter((b) => b.buildTypeId && ids.has(b.buildTypeId));
            for (const b of toCancel) {
              if (b.id == null) continue;
              // eslint-disable-next-line no-await-in-loop
              await api.buildQueue.deleteQueuedBuild(String(b.id));
              canceled += 1;
            }
          }
          return json({
            success: true,
            action: 'set_build_configs_paused',
            updated,
            canceled,
            paused: typed.paused,
            ids: typed.buildTypeIds,
          });
        },
        args
      );
    },
    mode: 'full',
  },

  // === Test Administration ===
  {
    name: 'mute_tests',
    description: 'Mute tests within a project or build configuration scope',
    inputSchema: {
      type: 'object',
      properties: {
        testNameIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Test name IDs to mute',
        },
        buildTypeId: {
          type: 'string',
          description: 'Scope mute to a specific build configuration ID',
        },
        projectId: {
          type: 'string',
          description: 'Scope mute to a project (required if buildTypeId omitted)',
        },
        comment: { type: 'string', description: 'Optional mute comment' },
        until: {
          type: 'string',
          description: 'Optional ISO timestamp to auto-unmute (yyyyMMddTHHmmss+ZZZZ)',
        },
        fields: {
          type: 'string',
          description: 'Optional fields selector for server-side projection',
        },
      },
      required: ['testNameIds'],
    },
    handler: async (args: unknown) => {
      const schema = z
        .object({
          testNameIds: z.array(z.string().min(1)).min(1),
          buildTypeId: z.string().min(1).optional(),
          projectId: z.string().min(1).optional(),
          comment: z.string().optional(),
          until: z.string().min(1).optional(),
          fields: z.string().min(1).optional(),
        })
        .refine((value) => Boolean(value.buildTypeId) || Boolean(value.projectId), {
          message: 'Either buildTypeId or projectId must be provided',
          path: [],
        });

      return runTool(
        'mute_tests',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          let scope: { buildType?: { id: string }; project?: { id: string } };
          if (typed.buildTypeId) {
            scope = { buildType: { id: typed.buildTypeId } };
          } else if (typed.projectId) {
            scope = { project: { id: typed.projectId } };
          } else {
            throw new Error('Scope must include a buildTypeId or projectId');
          }

          const payload: Mutes = {
            mute: [
              {
                scope,
                target: {
                  tests: {
                    test: typed.testNameIds.map((id) => ({ id })),
                  },
                },
                assignment: typed.comment ? { text: typed.comment } : undefined,
                resolution: typed.until
                  ? { type: ResolutionTypeEnum.AtTime, time: typed.until }
                  : undefined,
              },
            ],
          };

          const response = await api.mutes.muteMultipleTests(typed.fields, payload, {
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
          });

          const muted = Array.isArray(typed.testNameIds) ? typed.testNameIds.length : 0;
          return json({
            success: true,
            action: 'mute_tests',
            muted,
            scope,
            response: response.data,
          });
        },
        args
      );
    },
    mode: 'full',
  },

  // === Queue Maintenance ===
  {
    name: 'move_queued_build_to_top',
    description: 'Move a queued build to the top of the queue',
    inputSchema: {
      type: 'object',
      properties: { buildId: { type: 'string', description: 'Queued build ID' } },
      required: ['buildId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({ buildId: z.string().min(1) });
      return runTool(
        'move_queued_build_to_top',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          await api.buildQueue.setQueuedBuildsOrder(undefined, {
            build: [{ id: parseInt(typed.buildId) }],
          });
          return json({
            success: true,
            action: 'move_queued_build_to_top',
            buildId: typed.buildId,
          });
        },
        args
      );
    },
    mode: 'full',
  },
  {
    name: 'reorder_queued_builds',
    description: 'Reorder queued builds by providing the desired sequence of IDs',
    inputSchema: {
      type: 'object',
      properties: { buildIds: { type: 'array', items: { type: 'string' } } },
      required: ['buildIds'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({ buildIds: z.array(z.string().min(1)).min(1) });
      return runTool(
        'reorder_queued_builds',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          await api.buildQueue.setQueuedBuildsOrder(undefined, {
            build: typed.buildIds.map((id) => ({ id: parseInt(id) })),
          });
          return json({
            success: true,
            action: 'reorder_queued_builds',
            count: typed.buildIds.length,
          });
        },
        args
      );
    },
    mode: 'full',
  },
  {
    name: 'cancel_queued_builds_for_build_type',
    description: 'Cancel all queued builds for a specific build configuration',
    inputSchema: {
      type: 'object',
      properties: { buildTypeId: { type: 'string', description: 'Build type ID' } },
      required: ['buildTypeId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({ buildTypeId: z.string().min(1) });
      return runTool(
        'cancel_queued_builds_for_build_type',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const queue = await api.buildQueue.getAllQueuedBuilds();
          const builds = (queue.data?.build ?? []) as Array<{ id?: number; buildTypeId?: string }>;
          const toCancel = builds.filter((b) => b.buildTypeId === typed.buildTypeId);
          let canceled = 0;
          for (const b of toCancel) {
            if (b.id == null) continue;
            // eslint-disable-next-line no-await-in-loop
            await api.buildQueue.deleteQueuedBuild(String(b.id));
            canceled += 1;
          }
          return json({
            success: true,
            action: 'cancel_queued_builds_for_build_type',
            buildTypeId: typed.buildTypeId,
            canceled,
          });
        },
        args
      );
    },
    mode: 'full',
  },
  {
    name: 'cancel_queued_builds_by_locator',
    description: 'Cancel all queued builds matching a queue locator expression',
    inputSchema: {
      type: 'object',
      properties: { locator: { type: 'string', description: 'Queue locator expression' } },
      required: ['locator'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({ locator: z.string().min(1) });
      return runTool(
        'cancel_queued_builds_by_locator',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const queue = await api.buildQueue.getAllQueuedBuilds(typed.locator);
          const builds = (queue.data?.build ?? []) as Array<{ id?: number }>;
          let canceled = 0;
          for (const b of builds) {
            if (b.id == null) continue;
            // eslint-disable-next-line no-await-in-loop
            await api.buildQueue.deleteQueuedBuild(String(b.id));
            canceled += 1;
          }
          return json({
            success: true,
            action: 'cancel_queued_builds_by_locator',
            locator: typed.locator,
            canceled,
          });
        },
        args
      );
    },
    mode: 'full',
  },

  // === Scoped Pause/Resume (by pool) ===
  {
    name: 'pause_queue_for_pool',
    description:
      'Disable all agents in a pool to pause queue processing; optionally cancel queued builds for a build type',
    inputSchema: {
      type: 'object',
      properties: {
        poolId: { type: 'string', description: 'Agent pool ID' },
        cancelQueuedForBuildTypeId: {
          type: 'string',
          description: 'Optional buildTypeId: cancel queued builds for this configuration',
        },
        comment: { type: 'string', description: 'Optional comment for agent disablement' },
        until: { type: 'string', description: 'Optional ISO datetime to auto-reenable' },
      },
      required: ['poolId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        poolId: z.string().min(1),
        cancelQueuedForBuildTypeId: z.string().min(1).optional(),
        comment: z.string().optional(),
        until: z.string().min(1).optional(),
      });
      return runTool(
        'pause_queue_for_pool',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          // Disable all agents in pool
          const agentsResp = await api.agents.getAllAgents(`agentPool:(id:${typed.poolId})`);
          const agents = (agentsResp.data?.agent ?? []) as Array<{ id?: string }>;
          const body: { status: boolean; comment?: { text?: string }; statusSwitchTime?: string } =
            {
              status: false,
            };
          if (typed.comment) body.comment = { text: typed.comment };
          if (typed.until) body.statusSwitchTime = typed.until;
          let disabled = 0;
          for (const a of agents) {
            const id = a.id;
            if (!id) continue;
            // eslint-disable-next-line no-await-in-loop
            await api.agents.setEnabledInfo(id, undefined, body, {
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            });
            disabled += 1;
          }

          // Optionally cancel queued builds for provided buildTypeId
          let canceled = 0;
          if (typed.cancelQueuedForBuildTypeId) {
            const queue = await api.buildQueue.getAllQueuedBuilds();
            const builds = (queue.data?.build ?? []) as Array<{
              id?: number;
              buildTypeId?: string;
            }>;
            const toCancel = builds.filter(
              (b) => b.buildTypeId === typed.cancelQueuedForBuildTypeId
            );
            for (const b of toCancel) {
              if (b.id == null) continue;
              // eslint-disable-next-line no-await-in-loop
              await api.buildQueue.deleteQueuedBuild(String(b.id));
              canceled += 1;
            }
          }

          return json({
            success: true,
            action: 'pause_queue_for_pool',
            poolId: typed.poolId,
            disabledAgents: disabled,
            canceledQueued: canceled,
          });
        },
        args
      );
    },
    mode: 'full',
  },
  {
    name: 'resume_queue_for_pool',
    description: 'Re-enable all agents in a pool to resume queue processing',
    inputSchema: {
      type: 'object',
      properties: { poolId: { type: 'string', description: 'Agent pool ID' } },
      required: ['poolId'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({ poolId: z.string().min(1) });
      return runTool(
        'resume_queue_for_pool',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const agentsResp = await api.agents.getAllAgents(`agentPool:(id:${typed.poolId})`);
          const agents = (agentsResp.data?.agent ?? []) as Array<{ id?: string }>;
          let enabled = 0;
          for (const a of agents) {
            const id = a.id;
            if (!id) continue;
            // eslint-disable-next-line no-await-in-loop
            await api.agents.setEnabledInfo(
              id,
              undefined,
              { status: true },
              { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
            );
            enabled += 1;
          }
          return json({
            success: true,
            action: 'resume_queue_for_pool',
            poolId: typed.poolId,
            enabledAgents: enabled,
          });
        },
        args
      );
    },
    mode: 'full',
  },
  // === Agent Enable/Disable ===
  {
    name: 'set_agent_enabled',
    description: 'Enable/disable an agent, with optional comment and schedule',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID' },
        enabled: { type: 'boolean', description: 'True to enable, false to disable' },
        comment: { type: 'string', description: 'Optional comment' },
        until: {
          type: 'string',
          description: 'Optional ISO datetime to auto-flip state',
        },
      },
      required: ['agentId', 'enabled'],
    },
    handler: async (args: unknown) => {
      const schema = z.object({
        agentId: z.string().min(1),
        enabled: z.boolean(),
        comment: z.string().optional(),
        until: z.string().min(1).optional(),
      });
      return runTool(
        'set_agent_enabled',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const body: {
            status: boolean;
            comment?: { text?: string };
            statusSwitchTime?: string;
          } = { status: typed.enabled };
          if (typed.comment) body.comment = { text: typed.comment };
          if (typed.until) body.statusSwitchTime = typed.until;
          const resp = await api.agents.setEnabledInfo(typed.agentId, undefined, body, {
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          });
          return json({
            success: true,
            action: 'set_agent_enabled',
            agentId: typed.agentId,
            enabled: resp.data?.status ?? typed.enabled,
          });
        },
        args
      );
    },
    mode: 'full',
  },
  {
    name: 'bulk_set_agents_enabled',
    description:
      'Bulk enable/disable agents selected by pool or locator; supports comment/schedule',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: 'True to enable, false to disable' },
        poolId: { type: 'string', description: 'Agent pool ID (optional)' },
        locator: {
          type: 'string',
          description: 'Agent locator expression (alternative to poolId)',
        },
        comment: { type: 'string', description: 'Optional comment' },
        until: {
          type: 'string',
          description: 'Optional ISO datetime to auto-flip state',
        },
        includeDisabled: {
          type: 'boolean',
          description:
            'Include disabled agents in selection (default true when not filtering by enabled)',
        },
      },
      required: ['enabled'],
    },
    handler: async (args: unknown) => {
      const schema = z
        .object({
          enabled: z.boolean(),
          poolId: z.string().min(1).optional(),
          locator: z.string().min(1).optional(),
          comment: z.string().optional(),
          until: z.string().min(1).optional(),
          includeDisabled: z.boolean().optional(),
        })
        .refine((v) => Boolean(v.poolId ?? v.locator), {
          message: 'Either poolId or locator is required',
          path: ['poolId'],
        });
      return runTool(
        'bulk_set_agents_enabled',
        schema,
        async (typed) => {
          const api = TeamCityAPI.getInstance();
          const filters: string[] = [];
          if (typed.poolId) filters.push(`agentPool:(id:${typed.poolId})`);
          if (typed.locator) filters.push(typed.locator);
          if (typed.includeDisabled === false) filters.push('enabled:true');
          const locator = filters.join(',');

          const list = await api.agents.getAllAgents(locator);
          const agents = (list.data?.agent ?? []) as Array<{ id?: string; name?: string }>;
          const body: {
            status: boolean;
            comment?: { text?: string };
            statusSwitchTime?: string;
          } = { status: typed.enabled };
          if (typed.comment) body.comment = { text: typed.comment };
          if (typed.until) body.statusSwitchTime = typed.until;

          const results: Array<{ id: string; ok: boolean; error?: string }> = [];
          for (const a of agents) {
            const id = String(a.id ?? '');
            if (!id) continue;
            try {
              // eslint-disable-next-line no-await-in-loop
              await api.agents.setEnabledInfo(id, undefined, body, {
                headers: {
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                },
              });
              results.push({ id, ok: true });
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Unknown error';
              results.push({ id, ok: false, error: msg });
            }
          }

          const succeeded = results.filter((r) => r.ok).length;
          const failed = results.length - succeeded;
          return json({
            success: true,
            action: 'bulk_set_agents_enabled',
            total: results.length,
            succeeded,
            failed,
            results,
            locator,
            poolId: typed.poolId,
          });
        },
        args
      );
    },
    mode: 'full',
  },
];

/**
 * Get all available tools based on current mode
 */
export function getAvailableTools(): ToolDefinition[] {
  const mode = getMCPMode();
  if (mode === 'full') {
    const combined = [...DEV_TOOLS, ...FULL_MODE_TOOLS];
    const map = new Map<string, ToolDefinition>();
    for (const t of combined) map.set(t.name, t);
    return Array.from(map.values());
  }
  // Dev mode: include only tools not explicitly marked as full
  return DEV_TOOLS.filter((t) => t.mode !== 'full');
}

/**
 * Get tool by name (respects current mode)
 */
export function getTool(name: string): ToolDefinition | undefined {
  const tools = getAvailableTools();
  return tools.find((tool) => tool.name === name);
}

/**
 * Get tool by name or throw a descriptive error if unavailable.
 * Useful in tests and call sites where the tool is required.
 */
export function getRequiredTool(name: string): ToolDefinition {
  const tool = getTool(name);
  if (!tool) {
    const mode = getMCPMode();
    throw new Error(`Tool not available in ${mode} mode or not registered: ${name}`);
  }
  return tool;
}

/**
 * Get all tool names (respects current mode)
 */
export function getToolNames(): string[] {
  const tools = getAvailableTools();
  return tools.map((tool) => tool.name);
}
