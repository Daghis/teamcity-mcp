# TeamCity MCP — Tools Mode Matrix

Legend: Dev = developer-focused (PRs/builds/logs/trigger, read-only config). Full = all tools.

| Category | Tool | Dev | Full |
|---|---|---|---|
| Basic | `ping` | Yes | Yes |
| Projects | `list_projects` | Yes | Yes |
| Projects | `get_project` | Yes | Yes |
| Projects | `list_project_hierarchy` | Yes | Yes |
| Projects | `create_project` | No | Yes |
| Projects | `update_project_settings` | No | Yes |
| Projects | `delete_project` | No | Yes |
| Builds | `list_builds` | Yes | Yes |
| Builds | `get_build` | Yes | Yes |
| Builds | `get_build_status` | Yes | Yes |
| Builds | `fetch_build_log` | Yes | Yes |
| Builds | `get_build_results` | Yes | Yes |
| Builds | `analyze_build_problems` | Yes | Yes |
| Builds | `trigger_build` | Yes | Yes |
| Builds | `cancel_queued_build` | Yes | Yes |
| Build Configs | `list_build_configs` | Yes | Yes |
| Build Configs | `get_build_config` | Yes | Yes |
| Build Configs | `create_build_config` | No | Yes |
| Build Configs | `clone_build_config` | No | Yes |
| Build Configs | `update_build_config` | No | Yes |
| Build Configs | `set_build_configs_paused` | No | Yes |
| Steps & Triggers | `manage_build_steps` | No | Yes |
| Steps & Triggers | `manage_build_triggers` | No | Yes |
| Parameters | `list_parameters` | Yes | Yes |
| Parameters | `add_parameter` | No | Yes |
| Parameters | `update_parameter` | No | Yes |
| Parameters | `delete_parameter` | No | Yes |
| VCS | `list_vcs_roots` | Yes | Yes |
| VCS | `get_vcs_root` | Yes | Yes |
| VCS | `create_vcs_root` | No | Yes |
| VCS | `add_vcs_root_to_build` | No | Yes |
| Agents | `list_agents` | Yes | Yes |
| Agents | `list_agent_pools` | Yes | Yes |
| Agents | `authorize_agent` | No | Yes |
| Agents | `assign_agent_to_pool` | No | Yes |
| Agents | `get_agent_enabled_info` | Yes | Yes |
| Agents | `set_agent_enabled` | No | Yes |
| Agents | `bulk_set_agents_enabled` | No | Yes |
| Compatibility | `get_compatible_agents_for_build_type` | Yes | Yes |
| Compatibility | `count_compatible_agents_for_build_type` | Yes | Yes |
| Compatibility | `get_compatible_agents_for_queued_build` | Yes | Yes |
| Compatibility | `get_compatible_build_types_for_agent` | Yes | Yes |
| Compatibility | `get_incompatible_build_types_for_agent` | Yes | Yes |
| Queue | `list_queued_builds` | Yes | Yes |
| Queue | `move_queued_build_to_top` | No | Yes |
| Queue | `reorder_queued_builds` | No | Yes |
| Queue | `cancel_queued_builds_for_build_type` | No | Yes |
| Queue | `cancel_queued_builds_by_locator` | No | Yes |
| Queue | `pause_queue_for_pool` | No | Yes |
| Queue | `resume_queue_for_pool` | No | Yes |
| Server | `get_server_info` | Yes | Yes |
| Server | `check_teamcity_connection` | Yes | Yes |
| Server | `check_availability_guard` | Yes | Yes |
| Server | `get_server_metrics` | No | Yes |
| Server | `list_server_health_items` | No | Yes |
| Server | `get_server_health_item` | No | Yes |
| Tests | `list_test_failures` | Yes | Yes |
| Tests | `get_test_details` | Yes | Yes |
| Branches | `list_branches` | Yes | Yes |

Notes
- Dev mode excludes TeamCity administration and agent/pool management tools to reduce surface and context size, while keeping all read operations and developer workflows (including `trigger_build`).
