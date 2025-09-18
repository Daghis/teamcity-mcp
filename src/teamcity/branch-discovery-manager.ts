/**
 * BranchDiscoveryManager - Discovers branches from TeamCity build history
 */
import type { VcsRoot } from '@/teamcity-client/models';
import { debug, error as logError } from '@/utils/logger';

import type { TeamCityUnifiedClient } from './types/client';

export interface BranchInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
  isActive: boolean;
  buildCount: number;
  lastBuild?: {
    id: string;
    number: string;
    status: string;
    date: string;
    webUrl?: string;
  };
  firstSeenDate?: string;
  lastActivityDate?: string;
  vcsRoot?: {
    id: string;
    name: string;
    url: string;
  };
}

export interface DiscoveryOptions {
  limit?: number;
  fromDate?: Date;
  toDate?: Date;
  includeVcsInfo?: boolean;
}

export class BranchDiscoveryManager {
  constructor(private readonly client: TeamCityUnifiedClient) {}

  /**
   * Discover branches from build history for a specific build configuration
   */
  async discoverBranchesFromHistory(
    buildTypeId: string,
    options: DiscoveryOptions = {}
  ): Promise<BranchInfo[]> {
    try {
      const { limit = 1000, fromDate, toDate, includeVcsInfo = false } = options;

      // Build the locator string for querying builds
      const locatorParts = [
        `buildType:(id:${buildTypeId})`,
        'branch:(policy:ALL_BRANCHES)',
        `count:${limit}`,
      ];

      if (fromDate ?? toDate) {
        const dateConditions = [];
        if (fromDate) {
          dateConditions.push(`date:[${fromDate.toISOString()}]`);
        }
        if (toDate) {
          dateConditions.push(`date:[,${toDate.toISOString()}]`);
        }
        if (fromDate && toDate) {
          locatorParts.push(`startDate:(date:[${fromDate.toISOString()},${toDate.toISOString()}])`);
        } else if (fromDate) {
          locatorParts.push(`startDate:(date:[${fromDate.toISOString()},])`);
        } else if (toDate) {
          locatorParts.push(`startDate:(date:[,${toDate.toISOString()}])`);
        }
      }

      const locator = locatorParts.join(',');
      const fields =
        'build(id,buildTypeId,branchName,number,status,startDate,finishDate,webUrl,revisions(revision(vcsRootInstance(id,name,vcsRootId))))';

      debug(`Discovering branches for buildType: ${buildTypeId} with locator: ${locator}`);

      // Query builds from TeamCity
      const response = await this.client.modules.builds.getMultipleBuilds(locator, fields);

      const buildsResponse = response.data;
      const builds = buildsResponse.build ?? [];

      // Process builds to extract branch information
      const branchMap = new Map<string, BranchInfo>();

      for (const build of builds) {
        if (build.branchName == null) {
          continue;
        }

        const branchName = build.branchName;
        const existingBranch = branchMap.get(branchName);

        if (!existingBranch) {
          // First time seeing this branch
          const branchInfo: BranchInfo = {
            name: branchName,
            displayName: this.parseBranchDisplayName(branchName),
            isDefault:
              branchName === '<default>' || branchName === 'master' || branchName === 'main',
            isActive: false, // Will be determined later
            buildCount: 1,
            lastBuild: {
              id: build.id?.toString() ?? '',
              number: build.number ?? '',
              status: build.status ?? 'UNKNOWN',
              date: build.startDate ?? '',
              webUrl: build.webUrl,
            },
            firstSeenDate: build.startDate,
            lastActivityDate: build.startDate,
          };

          // Add VCS root information if requested and available
          // Note: Simplified for now - VCS root details would need additional API calls
          if (
            includeVcsInfo === true &&
            build.revisions?.revision != null &&
            build.revisions.revision.length > 0
          ) {
            const revision = build.revisions.revision[0];
            if (revision?.['vcs-root-instance'] != null) {
              const vcsRootInstance = revision['vcs-root-instance'];
              branchInfo.vcsRoot = {
                id: vcsRootInstance['vcs-root-id'] ?? '',
                name: vcsRootInstance.name ?? '',
                url: '', // Would need additional API call to get URL
              };
            }
          }

          branchMap.set(branchName, branchInfo);
        } else {
          // Update existing branch info
          existingBranch.buildCount++;

          // Update last build if this one is more recent
          if (build.startDate != null) {
            if (existingBranch.lastActivityDate == null) {
              existingBranch.lastBuild = {
                id: build.id?.toString() ?? '',
                number: build.number ?? '',
                status: build.status ?? 'UNKNOWN',
                date: build.startDate ?? '',
                webUrl: build.webUrl,
              };
              existingBranch.lastActivityDate = build.startDate;
            } else {
              const buildDate = this.parseDate(build.startDate);
              const lastActivityDate = this.parseDate(existingBranch.lastActivityDate);
              if (buildDate > lastActivityDate) {
                existingBranch.lastBuild = {
                  id: build.id?.toString() ?? '',
                  number: build.number ?? '',
                  status: build.status ?? 'UNKNOWN',
                  date: build.startDate ?? '',
                  webUrl: build.webUrl,
                };
                existingBranch.lastActivityDate = build.startDate;
              }
            }
          }

          // Update first seen date if this one is older
          if (build.startDate != null) {
            if (!existingBranch.firstSeenDate) {
              existingBranch.firstSeenDate = build.startDate;
            } else {
              const buildDate = this.parseDate(build.startDate);
              const firstSeenDate = this.parseDate(existingBranch.firstSeenDate);
              if (buildDate < firstSeenDate) {
                existingBranch.firstSeenDate = build.startDate;
              }
            }
          }
        }
      }

      // Convert map to array and detect activity
      const branches = Array.from(branchMap.values());

      // Detect branch activity
      return branches.map((branch) => this.detectBranchActivity(branch));
    } catch (err) {
      const error = err as Error;
      logError('Failed to discover branches from history', error);
      throw new Error(`Failed to discover branches from history: ${error.message}`);
    }
  }

  /**
   * Enrich branch information with latest build data
   */
  async enrichBranchWithBuildInfo(branch: BranchInfo, buildTypeId: string): Promise<BranchInfo> {
    try {
      const locator = `buildType:(id:${buildTypeId}),branch:(name:${branch.name}),count:1`;
      const fields = 'build(id,number,status,startDate,finishDate,webUrl)';

      const response = await this.client.modules.builds.getMultipleBuilds(locator, fields);

      const buildsResponse = response.data;
      const builds = buildsResponse.build ?? [];

      if (builds.length > 0) {
        const latestBuild = builds[0];
        if (latestBuild != null) {
          // Return a new object instead of mutating the parameter
          return {
            ...branch,
            lastBuild: {
              id: latestBuild.id?.toString() ?? '',
              number: latestBuild.number ?? '',
              status: latestBuild.status ?? 'UNKNOWN',
              date: latestBuild.startDate ?? '',
              webUrl: latestBuild.webUrl,
            },
            buildCount: buildsResponse.count ?? 1,
            lastActivityDate: latestBuild.startDate,
          };
        }
      }

      return branch;
    } catch (err) {
      debug(`Failed to enrich branch ${branch.name}: ${err}`);
      return branch;
    }
  }

  /**
   * Detect if a branch is active based on recent activity
   */
  detectBranchActivity(branch: BranchInfo, thresholdDays: number = 30): BranchInfo {
    if (!branch.lastActivityDate) {
      branch.isActive = false;
      return branch;
    }

    const now = new Date();
    const lastActivity = this.parseDate(branch.lastActivityDate);
    const daysSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);

    branch.isActive = daysSinceActivity <= thresholdDays;

    return branch;
  }

  /**
   * Parse branch name to create a display-friendly version
   */
  parseBranchDisplayName(branchName: string): string {
    // Handle Git refs
    if (branchName.startsWith('refs/heads/')) {
      return branchName.replace('refs/heads/', '');
    }
    if (branchName.startsWith('refs/tags/')) {
      return branchName.replace('refs/tags/', '');
    }

    // Handle pull requests
    const prMatch = branchName.match(/^pull\/(\d+)\/(head|merge)$/);
    if (prMatch) {
      return `PR #${prMatch[1]}`;
    }

    // Handle merge requests (GitLab style)
    const mrMatch = branchName.match(/^merge-requests\/(\d+)\/(head|merge)$/);
    if (mrMatch) {
      return `MR #${mrMatch[1]}`;
    }

    // Handle special branches
    if (branchName === '<default>') {
      return 'default';
    }

    // Return as-is for other patterns
    return branchName;
  }

  /**
   * Parse TeamCity date format to JavaScript Date
   */
  private parseDate(dateString: string): Date {
    // TeamCity format: 20250829T100000+0000
    return new Date(
      dateString
        .replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})([+-]\d{4})/, '$1-$2-$3T$4:$5:$6$7')
        .replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
    );
  }

  /**
   * Extract VCS URL from VcsRoot object
   */
  private extractVcsUrl(vcsRoot: VcsRoot): string {
    if (!vcsRoot.properties?.property) {
      return '';
    }

    const urlProperty = vcsRoot.properties.property.find(
      (p) => p.name === 'url' || p.name === 'repositoryURL'
    );

    return urlProperty?.value ?? '';
  }
}
