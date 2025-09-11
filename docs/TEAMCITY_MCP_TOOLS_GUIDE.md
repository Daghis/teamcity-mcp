# TeamCity MCP Tools & Capabilities Guide

## Overview

The TeamCity MCP (Model Context Protocol) server provides a comprehensive set of tools for interacting with JetBrains TeamCity CI/CD server through AI-powered coding assistants. This document provides a complete reference for all available tools, their capabilities, and practical workflows.

## Architecture Overview

### Core Components

1. **MCP Server** - Handles protocol communication and tool execution
2. **DI System** - Advanced dependency injection with caching, metrics, and tracing
3. **TeamCity Client** - API client with comprehensive error handling
4. **Tool Registry** - Dynamic tool loading based on operation mode
5. **Formatters** - Output formatting for build steps, triggers, and results

### Key Features

- **Two Operation Modes**: Dev (safe operations) and Full (complete control)
- **Intelligent Caching**: Automatic result caching with TTL and invalidation
- **Performance Monitoring**: Built-in metrics and distributed tracing
- **Type Safety**: Full TypeScript with Zod schema validation
- **Error Recovery**: Comprehensive error handling with user-friendly messages

## Current Implementation Notes

The live implementation emphasizes a simple, direct architecture. A few practical details to help you use the tools effectively:

- Response shape: List/get tools return a JSON object encoded as text in the MCP `content` field. For lists, the payload is typically:
  `{ "items": [...], "pagination": { "page": 1, "pageSize": 100 } }` or `{ "items": [...], "pagination": { "mode": "all", "pageSize": 100, "fetched": 250 } }`.
- Validation and errors: Tool inputs are validated with Zod. Errors are formatted consistently (production messages sanitized); logs redact sensitive values.
- Pagination arguments (where supported): `pageSize`, `maxPages`, `all`. The legacy `count` on `list_builds` remains for compatibility but `pageSize` is preferred.
- Tools with pagination: `list_builds`, `list_projects`, `list_build_configs`, `list_vcs_roots`, `list_agents`, `list_agent_pools`, `list_test_failures`.
- Enhanced results:
  - `get_build_results` supports options: `includeArtifacts`, `includeStatistics`, `includeChanges`, `includeDependencies`, `artifactFilter`, `maxArtifactSize`.
  - `get_build_status` supports options: `includeTests`, `includeProblems`, `useEnhanced` (when true, returns a richer JSON status payload).

## Operation Modes

### Dev Mode

Safe, read-only operations suitable for production environments. Enables monitoring, analysis, and controlled build triggering without infrastructure changes.

### Full Mode

Complete infrastructure management including creation, modification, and deletion of configurations, projects, and settings.

## Tools Quick Reference

| Tool Name                    | Description                                     | Dev | Full |
| ---------------------------- | ----------------------------------------------- | :--: | :--: |
| **Build Management**         |                                                 |      |      |
| `trigger_build`              | Trigger builds with comprehensive configuration |  ✅  |  ✅  |
| `get_build_status`           | Get detailed build status and progress          |  ✅  |  ✅  |
| `list_builds`                | Search and list builds with filtering           |  ✅  |  ✅  |
| `get_build_results`          | Get comprehensive build results                 |  ✅  |  ✅  |
| `fetch_build_log`            | Retrieve and analyze build logs                 |  ✅  |  ✅  |
| `get_build_config`           | Get build configuration details                 |  ✅  |  ✅  |
| `list_build_configs`         | List build configurations in project            |  ✅  |  ✅  |
| **Test Analysis**            |                                                 |      |      |
| `list_test_failures`         | Analyze failed tests across builds              |  ✅  |  ✅  |
| `get_test_details`           | Deep dive into test results                     |  ✅  |  ✅  |
| `analyze_build_problems`     | Intelligent build problem analysis              |  ✅  |  ✅  |
| **Configuration Management** |                                                 |      |      |
| `create_build_config`        | Create new build configurations                 |  ❌  |  ✅  |
| `clone_build_config`         | Duplicate existing configurations               |  ❌  |  ✅  |
| `update_build_config`        | Modify existing configurations                  |  ❌  |  ✅  |
| `manage_build_steps`         | Add, edit, remove, reorder build steps          |  ❌  |  ✅  |
| `manage_build_triggers`      | Configure build triggers                        |  ❌  |  ✅  |
| **VCS Management**           |                                                 |      |      |
| `list_vcs_roots`             | List version control roots                      |  ✅  |  ✅  |
| `create_vcs_root`            | Create VCS root configurations                  |  ❌  |  ✅  |
| **Project Management**       |                                                 |      |      |
| `list_projects`              | List all projects                               |  ✅  |  ✅  |
| `list_project_hierarchy`     | Visualize project structure                     |  ✅  |  ✅  |
| `create_project`             | Create new projects                             |  ❌  |  ✅  |
| `move_project`               | Reorganize project hierarchy                    |  ❌  |  ✅  |
| `delete_project`             | Remove projects safely                          |  ❌  |  ✅  |
| `update_project_settings`    | Modify project settings                         |  ❌  |  ✅  |
| **Parameter Management**     |                                                 |      |      |
| `list_parameters`            | List configuration parameters                   |  ✅  |  ✅  |
| `add_parameter`              | Add new parameters                              |  ❌  |  ✅  |
| `update_parameter`           | Modify existing parameters                      |  ❌  |  ✅  |
| `delete_parameter`           | Remove parameters                               |  ❌  |  ✅  |
| `bulk_manage_parameters`     | Batch parameter operations                      |  ❌  |  ✅  |
| **Agent Management**         |                                                 |      |      |
| `list_agents`                | List build agents and status                    |  ✅  |  ✅  |
| `list_agent_pools`           | List agent pools with metrics                   |  ❌  |  ✅  |
| `assign_agent_to_pool`       | Move agents between pools                       |  ❌  |  ✅  |
| `authorize_agent`            | Manage agent authorization                      |  ❌  |  ✅  |
| **Branch Management**        |                                                 |      |      |
| `list_branches`              | List and analyze branches                       |  ✅  |  ✅  |
| **Utility**                  |                                                 |      |      |
| `ping`                       | Health check and connection test                |  ✅  |  ✅  |

**Legend:**

- ✅ Available in this mode
- ❌ Not available in this mode

## Tool Categories

### 1. Build Management Tools

#### `trigger_build`

**Description**: Trigger builds with comprehensive configuration options
**Mode**: Dev
**Key Capabilities**:

- Single or multiple build triggering (comma-separated configs)
- Branch selection with intelligent resolution
- Personal builds for isolated testing
- Build dependencies and chaining
- Queue position management
- Real-time monitoring with wait option
- Dry run mode for validation

**Parameters**:

- `buildConfiguration` (required): ID, name, or context (commit SHA, PR#)
- `branch`: Branch name (defaults to main)
- `parameters`: Array of key=value pairs
- `personal`: Run as personal build
- `comment`: Build description
- `dependencies`: Build IDs to depend on
- `moveToTop`: Prioritize in queue
- `wait`: Wait for completion
- `waitTimeout`: Max wait time (ms)
- `dryRun`: Preview without queueing

**Example Use Cases**:

```typescript
// Trigger feature branch build
{
  buildConfiguration: "MyApp_Build",
  branch: "feature/new-ui",
  comment: "Testing UI changes",
  moveToTop: true
}

// Trigger multiple builds with dependencies
{
  buildConfiguration: "Backend_Build,Frontend_Build",
  dependencies: ["12345"],
  parameters: ["env=staging", "deploy=true"]
}
```

#### `get_build_status`

**Description**: Get detailed build status and progress
**Mode**: Dev
**Key Capabilities**:

- Real-time progress tracking
- Stage-by-stage breakdown
- Test and artifact information
- Time estimations

**Parameters**:

- `buildId` (required): Build identifier

#### `list_builds`

**Description**: Search and list builds with filtering
**Mode**: Dev
**Key Capabilities**:

- Filter by project, configuration, branch
- Status and date range filtering
- Pagination support
- Custom field selection

**Parameters**:

- `projectId`: Filter by project
- `buildTypeId`: Filter by configuration
- `branch`: Filter by branch
- `status`: SUCCESS, FAILURE, ERROR
- `state`: queued, running, finished
- `limit`: Maximum results
- `fields`: Custom field selection

#### `get_build_results`

**Description**: Get comprehensive build results
**Mode**: Dev
**Key Capabilities**:

- Test results summary
- Artifact listings
- Problem occurrences
- Statistics and metrics

**Parameters**:

- `buildId` (required): Build identifier
- `includeTests`: Include test details
- `includeProblems`: Include problems
- `includeArtifacts`: Include artifacts

#### `fetch_build_log`

**Description**: Retrieve and analyze build logs
**Mode**: Dev
**Key Capabilities**:

- Full or partial log retrieval
- Error extraction
- Log analysis and summarization
- Streaming support for large logs

**Parameters**:

- `buildId` (required): Build identifier
- `startLine`: Starting line number
- `maxLines`: Maximum lines to retrieve
- `format`: raw, formatted, errors-only

### 2. Test Analysis Tools

#### `list_test_failures`

**Description**: Analyze failed tests across builds
**Mode**: Dev
**Key Capabilities**:

- Stack trace parsing
- Failure categorization
- Historical failure tracking
- Pattern detection

**Parameters**:

- `buildId`: Specific build or latest
- `projectId`: Filter by project
- `includeStackTraces`: Include full traces
- `groupByError`: Group similar failures

#### `get_test_details`

**Description**: Deep dive into test results
**Mode**: Dev
**Key Capabilities**:

- Performance analysis
- Flakiness detection
- Historical trends
- Failure root cause analysis

**Parameters**:

- `testNameId` (required): Test identifier
- `buildId`: Specific build context
- `includeHistory`: Historical data
- `limit`: History depth

#### `analyze_build_problems`

**Description**: Intelligent build problem analysis
**Mode**: Dev
**Key Capabilities**:

- Problem categorization
- Root cause detection
- Solution suggestions
- Impact analysis

**Parameters**:

- `buildId` (required): Build identifier
- `includeInvestigations`: Include assigned investigations
- `includeMuted`: Include muted problems

### 3. Configuration Management Tools (Full Mode Only)

#### `create_build_config`

**Description**: Create new build configurations
**Mode**: Full
**Key Capabilities**:

- VCS root creation and attachment
- Build step configuration
- Trigger setup
- Template-based creation
- Parameter management

**Parameters**:

- `projectId` (required): Target project
- `name` (required): Configuration name
- `description`: Purpose description
- `vcs`: Version control settings
  - `url`: Repository URL
  - `branch`: Default branch
  - `type`: git, svn, perforce
  - `authentication`: Credentials
- `steps`: Build step array
- `triggers`: Trigger array
- `parameters`: Key-value parameters
- `templateId`: Base template

**Example**:

```typescript
{
  projectId: "MyProject",
  name: "Node.js Application",
  vcs: {
    url: "https://github.com/myorg/myapp.git",
    branch: "main",
    type: "git"
  },
  steps: [
    {
      type: "npm",
      name: "Install Dependencies",
      script: "npm ci"
    },
    {
      type: "npm",
      name: "Run Tests",
      script: "npm test"
    }
  ],
  triggers: [
    {
      type: "vcs",
      rules: "+:*"
    }
  ]
}
```

#### `clone_build_config`

**Description**: Duplicate existing configurations
**Mode**: Full
**Key Capabilities**:

- Deep or shallow cloning
- Selective component copying
- Name and ID customization
- Cross-project cloning

**Parameters**:

- `sourceConfigId` (required): Source configuration
- `targetProjectId` (required): Target project
- `newName` (required): New configuration name
- `copySettings`: Include settings
- `copySteps`: Include build steps
- `copyTriggers`: Include triggers
- `copyDependencies`: Include dependencies

#### `update_build_config`

**Description**: Modify existing configurations
**Mode**: Full
**Key Capabilities**:

- Partial updates
- Setting modifications
- Enable/disable configurations
- Description updates

**Parameters**:

- `configId` (required): Configuration ID
- `name`: New name
- `description`: New description
- `enabled`: Enable/disable
- `settings`: Updated settings

#### `manage_build_steps`

**Description**: Comprehensive build step management
**Mode**: Full
**Key Capabilities**:

- Add, edit, remove, reorder steps
- Support for all runner types
- Property configuration
- Step templates

**Parameters**:

- `action` (required): list, add, edit, remove, reorder
- `configId` (required): Configuration ID
- `stepId`: Step ID (for edit/remove)
- `stepConfig`: Step configuration
  - `name`: Step name
  - `type`: Runner type
  - `enabled`: Enable status
  - `properties`: Runner properties
  - `parameters`: Step parameters
- `newOrder`: Step ID array (for reorder)

**Supported Runner Types**:

- `simpleRunner`: Shell/Batch scripts
- `Maven2`: Maven builds
- `gradle-runner`: Gradle builds
- `MSBuild`: MSBuild projects
- `dotnet`: .NET Core/5+ builds
- `nodejs-runner`: Node.js scripts
- `Docker`: Docker operations
- `python`: Python scripts
- `cargo`: Rust/Cargo builds
- `kotlinScript`: Kotlin scripts

#### `manage_build_triggers`

**Description**: Configure build triggers
**Mode**: Full
**Key Capabilities**:

- VCS triggers with branch filters
- Schedule triggers (cron)
- Build finish triggers
- Maven snapshot dependencies

**Parameters**:

- `action` (required): list, add, edit, remove
- `configId` (required): Configuration ID
- `triggerId`: Trigger ID (for edit/remove)
- `triggerConfig`: Trigger configuration
  - `type`: vcs, schedule, finish-build
  - `rules`: Branch filter rules
  - `schedule`: Cron expression
  - `buildType`: Dependent build
  - `branchFilter`: Branch patterns

### 4. VCS Management Tools

#### `list_vcs_roots`

**Description**: List version control roots
**Mode**: Dev
**Key Capabilities**:

- Project filtering
- Usage tracking
- Configuration details

**Parameters**:

- `projectId`: Filter by project
- `includeUsages`: Show where used

#### `create_vcs_root`

**Description**: Create VCS root configurations
**Mode**: Full
**Key Capabilities**:

- Multi-VCS support (Git, SVN, Perforce)
- Authentication configuration
- Branch specification
- Polling settings

**Parameters**:

- `projectId` (required): Target project
- `name` (required): VCS root name
- `url` (required): Repository URL
- `type`: VCS type
- `branch`: Default branch
- `authentication`: Auth settings
- `pollingInterval`: Check frequency

### 5. Project Management Tools

#### `list_projects`

**Description**: List all projects
**Mode**: Dev
**Key Capabilities**:

- Hierarchical view
- Permission filtering
- Archive inclusion

**Parameters**:

- `includeArchived`: Include archived
- `fields`: Custom fields

#### `list_project_hierarchy`

**Description**: Visualize project structure
**Mode**: Dev/Full
**Key Capabilities**:

- Tree visualization
- Depth control
- Build configuration counts
- Permission indicators

**Parameters**:

- `rootProjectId`: Starting point
- `maxDepth`: Tree depth
- `includeConfigs`: Show configurations
- `format`: tree, flat, json

#### `create_project`

**Description**: Create new projects
**Mode**: Full
**Key Capabilities**:

- Sub-project support
- Initial configuration
- Permission setup
- Template application

**Parameters**:

- `parentProjectId` (required): Parent project
- `name` (required): Project name
- `id`: Custom ID
- `description`: Project description
- `copySettingsFrom`: Template project

#### `move_project`

**Description**: Reorganize project hierarchy
**Mode**: Full
**Key Capabilities**:

- Cross-hierarchy moves
- Permission preservation
- Configuration updates

**Parameters**:

- `projectId` (required): Project to move
- `targetParentId` (required): New parent

#### `delete_project`

**Description**: Remove projects safely
**Mode**: Full
**Key Capabilities**:

- Cascade deletion
- Archive option
- Safety checks
- Rollback support

**Parameters**:

- `projectId` (required): Project to delete
- `archive`: Archive instead of delete
- `force`: Skip confirmations

#### `update_project_settings`

**Description**: Modify project settings
**Mode**: Full
**Key Capabilities**:

- Parameter management
- Feature toggling
- Description updates

**Parameters**:

- `projectId` (required): Target project
- `name`: New name
- `description`: New description
- `parameters`: Key-value settings
- `archived`: Archive status

### 6. Parameter Management Tools

#### `list_parameters`

**Description**: List configuration parameters
**Mode**: Dev
**Key Capabilities**:

- Inherited parameter tracking
- Value resolution
- Type information

**Parameters**:

- `configId` (required): Configuration ID
- `includeInherited`: Show inherited
- `includeSystem`: Show system params

#### `add_parameter`

**Description**: Add new parameters
**Mode**: Full
**Key Capabilities**:

- Type specification
- Value validation
- Secure storage

**Parameters**:

- `configId` (required): Configuration ID
- `name` (required): Parameter name
- `value` (required): Parameter value
- `type`: text, password, select
- `label`: Display label
- `description`: Help text

#### `update_parameter`

**Description**: Modify existing parameters
**Mode**: Full
**Key Capabilities**:

- Value updates
- Type changes
- Metadata updates

**Parameters**:

- `configId` (required): Configuration ID
- `name` (required): Parameter name
- `value`: New value
- `type`: New type
- `description`: New description

#### `delete_parameter`

**Description**: Remove parameters
**Mode**: Full
**Key Capabilities**:

- Safe deletion
- Dependency checking

**Parameters**:

- `configId` (required): Configuration ID
- `name` (required): Parameter name

#### `bulk_manage_parameters`

**Description**: Batch parameter operations
**Mode**: Full
**Key Capabilities**:

- Multi-parameter updates
- Import/export
- Template application

**Parameters**:

- `configId` (required): Configuration ID
- `operations`: Array of operations
  - `action`: add, update, delete
  - `name`: Parameter name
  - `value`: Parameter value

### 7. Agent Management Tools

#### `list_agents`

**Description**: List build agents
**Mode**: Dev
**Key Capabilities**:

- Status monitoring
- Capability listing
- Pool assignments
- Running builds

**Parameters**:

- `includeDisconnected`: Include offline
- `poolId`: Filter by pool
- `authorized`: Filter by auth status

#### `list_agent_pools`

**Description**: List agent pools
**Mode**: Full
**Key Capabilities**:

- Pool metrics
- Agent counts
- Project assignments

**Parameters**:

- `includeProjects`: Show projects
- `includeAgents`: List agents

#### `assign_agent_to_pool`

**Description**: Move agents between pools
**Mode**: Full
**Key Capabilities**:

- Pool reassignment
- Bulk operations

**Parameters**:

- `agentId` (required): Agent ID
- `poolId` (required): Target pool

#### `authorize_agent`

**Description**: Manage agent authorization
**Mode**: Full
**Key Capabilities**:

- Authorize/unauthorize
- Comment addition

**Parameters**:

- `agentId` (required): Agent ID
- `authorized` (required): Auth status
- `comment`: Reason/comment

### 8. Branch Management Tools

#### `list_branches`

**Description**: List and analyze branches
**Mode**: Dev
**Key Capabilities**:

- Multi-mode listing (all, active, default)
- Build status per branch
- Last build information
- Activity detection

**Parameters**:

- `configId` (required): Configuration ID
- `mode`: all, active, default, with-builds
- `includeBuilds`: Include build info

### 9. Utility Tools

#### `ping`

**Description**: Health check and connection test
**Mode**: Dev
**Key Capabilities**:

- Server connectivity
- Authentication validation
- Version information
- Performance metrics

**Parameters**: None

## Common Workflows

### 1. Continuous Integration Workflow

```yaml
Workflow: Set up CI for new project
Steps: 1. Create project structure
  - create_project (parent, name, description)
  2. Create VCS root
  - create_vcs_root (git URL, authentication)
  3. Create build configuration
  - create_build_config (project, VCS, steps)
  4. Configure triggers
  - manage_build_triggers (add VCS trigger)
  5. Test the setup
  - trigger_build (dry run mode)
  6. Monitor first build
  - trigger_build (with wait option)
```

### 2. Test Failure Investigation

```yaml
Workflow: Investigate test failures
Steps:
  1. List recent failed builds
     - list_builds (status: FAILURE)
  2. Get test failures
     - list_test_failures (buildId, includeStackTraces)
  3. Analyze specific test
     - get_test_details (testNameId, includeHistory)
  4. Review build problems
     - analyze_build_problems (buildId)
  5. Check build logs
     - fetch_build_log (buildId, errors-only)
```

### 3. Deployment Pipeline Setup

```yaml
Workflow: Create deployment pipeline
Steps: 1. Create staging configuration
  - clone_build_config (from dev config)
  2. Add deployment steps
  - manage_build_steps (add Docker/K8s steps)
  3. Configure parameters
  - bulk_manage_parameters (environment vars)
  4. Set up triggers
  - manage_build_triggers (finish-build from tests)
  5. Create production config
  - clone_build_config (from staging)
  6. Add manual trigger requirement
  - update_build_config (require approval)
```

### 4. Build Performance Optimization

```yaml
Workflow: Optimize slow builds
Steps: 1. Analyze build history
  - list_builds (with timing data)
  2. Review build steps
  - manage_build_steps (list with timings)
  3. Check agent utilization
  - list_agents (with current builds)
  4. Examine test performance
  - get_test_details (performance analysis)
  5. Reconfigure steps
  - manage_build_steps (reorder/parallelize)
  6. Update agent pools
  - assign_agent_to_pool (balance load)
```

### 5. Multi-Branch Development

```yaml
Workflow: Support feature branches
Steps:
  1. List active branches
     - list_branches (mode: active)
  2. Configure branch filters
     - manage_build_triggers (branch patterns)
  3. Set up personal builds
     - trigger_build (personal: true)
  4. Monitor branch builds
     - list_builds (branch filter)
  5. Clean up old branches
     - list_branches (identify inactive)
```

## Error Handling

### Common Error Patterns

1. **Authentication Errors**
   - Invalid token: Check TEAMCITY_TOKEN
   - Expired token: Regenerate in TeamCity
   - Permission denied: Verify user roles

2. **Configuration Errors**
   - Not found: Verify ID/name
   - Already exists: Use unique names
   - Invalid parameters: Check schema

3. **Network Errors**
   - Connection refused: Verify TEAMCITY_URL
   - Timeout: Check network/firewall
   - SSL errors: Verify certificates

4. **Validation Errors**
   - Schema validation: Check input format
   - Missing required: Provide all required fields
   - Type mismatch: Verify data types

### Error Recovery Strategies

1. **Automatic Retry**: Network failures retry with exponential backoff
2. **Caching**: Failed requests served from cache when available
3. **Fallback**: Degraded functionality in dev mode
4. **Rollback**: Configuration changes can be reverted

## Security Considerations

### Authentication

- Token-based authentication only
- No password storage
- Secure token transmission

### Authorization

- Mode-based permission control
- Project-level access control
- Audit logging for all changes

### Data Protection

- Sensitive parameter encryption
- Secure VCS credential storage
- No credential logging

## Testing Strategies

### Unit Testing

```typescript
// Test individual tool handlers
describe('trigger_build', () => {
  it('should queue build successfully', async () => {
    const result = await triggerBuildTool.handler({
      buildConfiguration: 'Test_Build',
      branch: 'main',
    });
    expect(result.success).toBe(true);
  });
});
```

### Integration Testing

```typescript
// Test complete workflows
describe('CI Workflow', () => {
  it('should set up complete CI pipeline', async () => {
    // Create project
    const project = await createProject({ ... });
    // Add configuration
    const config = await createBuildConfig({ ... });
    // Trigger build
    const build = await triggerBuild({ ... });
    // Verify results
    expect(build.status).toBe('SUCCESS');
  });
});
```

### End-to-End Testing

```typescript
// Test through MCP protocol
describe('MCP Integration', () => {
  it('should handle tool calls via MCP', async () => {
    const response = await mcpClient.callTool('trigger_build', { buildConfiguration: 'E2E_Test' });
    expect(response.success).toBe(true);
  });
});
```

## Best Practices

### 1. Configuration as Code

- Store configurations in version control
- Use templates for consistency
- Automate configuration updates

### 2. Build Organization

- Group related builds in projects
- Use clear naming conventions
- Document build purposes

### 3. Performance

- Parallelize independent steps
- Use agent pools effectively
- Cache dependencies

### 4. Monitoring

- Set up build failure notifications
- Track build time trends
- Monitor test stability

### 5. Security

- Rotate tokens regularly
- Use parameter encryption
- Audit configuration changes

## Troubleshooting Guide

### Build Failures

1. Check `fetch_build_log` for errors
2. Review `analyze_build_problems`
3. Examine `list_test_failures`
4. Verify configuration with `get_build_config`

### Performance Issues

1. Analyze with `get_build_results`
2. Check agent availability
3. Review step timings
4. Optimize parallelization

### Configuration Problems

1. Validate with dry run
2. Check parameter values
3. Verify VCS access
4. Review trigger rules

## Appendix

### A. Runner Type Properties

#### Shell/Batch Script (simpleRunner)

- `script.content`: Script body
- `use.custom.script`: true/false
- `teamcity.step.mode`: default/execute

#### Maven (Maven2)

- `goals`: Maven goals
- `pomLocation`: POM file path
- `maven.home`: Maven installation

#### Gradle (gradle-runner)

- `ui.gradleRunner.gradle.tasks.names`: Tasks
- `ui.gradleRunner.gradle.wrapper.path`: Wrapper path
- `ui.gradleRunner.gradle.wrapper.useWrapper`: true/false

#### Docker

- `docker.image.platform`: Platform
- `docker.command.type`: build/run/push
- `dockerfile.path`: Dockerfile location

### B. Trigger Rule Syntax

#### VCS Trigger Rules

- `+:*` - All branches
- `+:refs/heads/main` - Main branch only
- `+:refs/heads/feature/*` - Feature branches
- `-:refs/heads/experimental/*` - Exclude experimental

#### Schedule Expressions

- `0 0 * * *` - Daily at midnight
- `0 */2 * * *` - Every 2 hours
- `0 9-17 * * 1-5` - Weekdays 9-5

### C. Parameter Types

- `text` - Plain text
- `password` - Encrypted storage
- `checkbox` - Boolean
- `select` - Dropdown with options
- `display` - Read-only display

### D. API Response Formats

All tools return a consistent response format:

```typescript
interface ToolResponse {
  success: boolean;
  data?: any;
  error?: string;
  content?: string;
}
```

## Conclusion

The TeamCity MCP server provides comprehensive CI/CD automation through natural language interfaces. With proper understanding of these tools and workflows, teams can achieve efficient, reliable continuous integration and deployment processes.

For updates and additional information, refer to the project repository and TeamCity documentation.
