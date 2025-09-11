/**
 * Example usage of the ListBuildConfigs MCP tool
 * Demonstrates various filtering and query patterns
 */

import { listBuildConfigsTool } from '@/tools/list-build-configs';

// Example 1: Basic listing of all build configurations
async function listAllConfigurations() {
  const result = await listBuildConfigsTool.handler({});
  
  if (result.success && result.data) {
    console.log(`Found ${result.data.totalCount} build configurations`);
    result.data.buildConfigs.forEach(config => {
      console.log(`- ${config.name} (${config.id})`);
    });
  }
}

// Example 2: Filter by specific project
async function listProjectConfigurations(projectId: string) {
  const result = await listBuildConfigsTool.handler({
    projectId,
    includeProjectHierarchy: true
  });
  
  if (result.success && result.data) {
    console.log(`Build configurations in project ${projectId}:`);
    result.data.buildConfigs.forEach(config => {
      const path = config.projectHierarchy
        ?.map(p => p.name)
        .join(' > ') || '';
      console.log(`- ${config.name} (Path: ${path})`);
    });
  }
}

// Example 3: Search for deployment configurations
async function findDeploymentConfigs() {
  const result = await listBuildConfigsTool.handler({
    namePattern: '*Deploy*',
    statusFilter: {
      paused: false,
      lastBuildStatus: 'SUCCESS'
    },
    sortBy: 'lastModified',
    sortOrder: 'desc'
  });
  
  if (result.success && result.data) {
    console.log('Active deployment configurations (recently successful):');
    result.data.buildConfigs.forEach(config => {
      console.log(`- ${config.name} (Last: ${config.lastBuildDate})`);
    });
  }
}

// Example 4: Find configurations using specific VCS repository
async function findConfigsByRepository(repoUrl: string) {
  const result = await listBuildConfigsTool.handler({
    vcsRootFilter: {
      url: repoUrl,
      vcsName: 'git'
    },
    includeVcsRoots: true
  });
  
  if (result.success && result.data) {
    console.log(`Configurations using repository ${repoUrl}:`);
    result.data.buildConfigs.forEach(config => {
      const vcsInfo = config.vcsRoots
        ?.map(vcs => `${vcs.name} (${vcs.branch})`)
        .join(', ') || 'No VCS';
      console.log(`- ${config.name}: ${vcsInfo}`);
    });
  }
}

// Example 5: Paginated retrieval for large datasets
async function paginateThroughConfigs() {
  let offset = 0;
  const limit = 50;
  let hasMore = true;
  const allConfigs = [];
  
  while (hasMore) {
    const result = await listBuildConfigsTool.handler({
      pagination: { limit, offset }
    });
    
    if (result.success && result.data) {
      allConfigs.push(...result.data.buildConfigs);
      hasMore = result.data.hasMore;
      offset += limit;
      
      console.log(`Fetched ${result.data.buildConfigs.length} configs (total: ${allConfigs.length})`);
    } else {
      break;
    }
  }
  
  return allConfigs;
}

// Example 6: Get grouped view by project
async function getProjectGroupedView() {
  const result = await listBuildConfigsTool.handler({
    viewMode: 'project-grouped',
    includeParameters: true
  });
  
  if (result.success && result.data && result.data.groupedByProject) {
    Object.entries(result.data.groupedByProject).forEach(([projectId, group]) => {
      console.log(`\nProject: ${group.projectName} (${projectId})`);
      console.log(`  Configurations: ${group.buildConfigs.length}`);
      
      group.buildConfigs.forEach(config => {
        const params = config.parameters 
          ? Object.keys(config.parameters).length 
          : 0;
        console.log(`  - ${config.name} (${params} parameters)`);
      });
    });
  }
}

// Example 7: Complex compound filtering
async function advancedFiltering() {
  const result = await listBuildConfigsTool.handler({
    projectIds: ['Frontend', 'Backend', 'Mobile'],
    namePattern: '*CI*',
    vcsRootFilter: {
      branch: 'main'
    },
    statusFilter: {
      hasRecentActivity: true,
      activeSince: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last week
    },
    sortBy: 'name',
    sortOrder: 'asc',
    includeVcsRoots: true,
    includeParameters: true,
    pagination: {
      limit: 25,
      offset: 0
    }
  });
  
  if (result.success && result.data) {
    console.log(`Found ${result.data.buildConfigs.length} CI configurations active in the last week`);
    
    result.data.buildConfigs.forEach(config => {
      console.log(`\n${config.name} (${config.projectName})`);
      console.log(`  Last build: ${config.lastBuildDate}`);
      console.log(`  Status: ${config.lastBuildStatus}`);
      
      if (config.vcsRoots && config.vcsRoots.length > 0) {
        console.log(`  VCS: ${config.vcsRoots.map(v => v.name).join(', ')}`);
      }
      
      if (config.parameters && Object.keys(config.parameters).length > 0) {
        console.log(`  Parameters: ${Object.keys(config.parameters).join(', ')}`);
      }
    });
  }
}

// Example 8: Find inactive or problematic configurations
async function findProblematicConfigs() {
  const result = await listBuildConfigsTool.handler({
    statusFilter: {
      lastBuildStatus: 'FAILURE',
      paused: false
    },
    sortBy: 'lastModified',
    sortOrder: 'desc'
  });
  
  if (result.success && result.data) {
    console.log('Configurations with recent failures:');
    result.data.buildConfigs.forEach(config => {
      console.log(`- ${config.name} (${config.projectName}) - Last: ${config.lastBuildDate}`);
    });
  }
  
  // Also check for paused configurations
  const pausedResult = await listBuildConfigsTool.handler({
    statusFilter: {
      paused: true
    }
  });
  
  if (pausedResult.success && pausedResult.data) {
    console.log('\nPaused configurations:');
    pausedResult.data.buildConfigs.forEach(config => {
      console.log(`- ${config.name} (${config.projectName})`);
    });
  }
}

// Example 9: Export configuration list to CSV
async function exportToCSV() {
  const result = await listBuildConfigsTool.handler({
    includeVcsRoots: true,
    includeParameters: true
  });
  
  if (result.success && result.data) {
    const csv = ['ID,Name,Project,Description,VCS Count,Parameter Count'];
    
    result.data.buildConfigs.forEach(config => {
      const vcsCount = config.vcsRoots?.length || 0;
      const paramCount = config.parameters ? Object.keys(config.parameters).length : 0;
      const description = config.description?.replace(/,/g, ';') || '';
      
      csv.push(`${config.id},${config.name},${config.projectName},"${description}",${vcsCount},${paramCount}`);
    });
    
    console.log(csv.join('\n'));
  }
}

// Example 10: Monitor configuration changes
async function monitorChanges(intervalMs = 60000) {
  let previousConfigs = new Map();
  
  const checkForChanges = async () => {
    const result = await listBuildConfigsTool.handler({
      sortBy: 'lastModified',
      sortOrder: 'desc',
      limit: 100
    });
    
    if (result.success && result.data) {
      const currentConfigs = new Map(
        result.data.buildConfigs.map(c => [c.id, c])
      );
      
      // Find new configurations
      currentConfigs.forEach((config, id) => {
        if (!previousConfigs.has(id)) {
          console.log(`NEW: ${config.name} (${id})`);
        }
      });
      
      // Find removed configurations
      previousConfigs.forEach((config, id) => {
        if (!currentConfigs.has(id)) {
          console.log(`REMOVED: ${config.name} (${id})`);
        }
      });
      
      previousConfigs = currentConfigs;
    }
  };
  
  // Initial check
  await checkForChanges();
  
  // Set up monitoring
  setInterval(checkForChanges, intervalMs);
}

// Export all examples
export {
  listAllConfigurations,
  listProjectConfigurations,
  findDeploymentConfigs,
  findConfigsByRepository,
  paginateThroughConfigs,
  getProjectGroupedView,
  advancedFiltering,
  findProblematicConfigs,
  exportToCSV,
  monitorChanges
};