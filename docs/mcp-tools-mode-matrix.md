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
| Builds | `get_build_results` | Yes | Yes |
| Builds | `fetch_build_log` | Yes | Yes |
| Builds | `analyze_build_problems` | Yes | Yes |
| Builds | `trigger_build` | Yes | Yes |
| Builds | `cancel_queued_build` | Yes | Yes |
| Builds | `download_build_artifact` | Yes | Yes |
| Builds | `download_build_artifacts` | Yes | Yes |
| Build Configs | `list_build_configs` | Yes | Yes |
| Build Configs | `get_build_config` | Yes | Yes |
| Build Configs | `create_build_config` | No | Yes |
| Build Configs | `clone_build_config` | No | Yes |
| Build Configs | `update_build_config` | No | Yes |
| Build Configs | `set_build_config_state` | No | Yes |
| Build Configs | `set_build_configs_paused` | No | Yes |
| Build Configs | `manage_build_dependencies` | No | Yes |
| Build Configs | `manage_build_features` | No | Yes |
| Steps & Triggers | `manage_build_steps` | No | Yes |
| Steps & Triggers | `manage_build_triggers` | No | Yes |
| Parameters | `list_parameters` | Yes | Yes |
| Parameters | `add_parameter` | No | Yes |
| Parameters | `update_parameter` | No | Yes |
| Parameters | `delete_parameter` | No | Yes |
| VCS | `list_vcs_roots` | No | Yes |
| VCS | `get_vcs_root` | No | Yes |
| VCS | `get_versioned_settings_status` | No | Yes |
| VCS | `create_vcs_root` | No | Yes |
| VCS | `add_vcs_root_to_build` | No | Yes |
| VCS | `set_vcs_root_property` | No | Yes |
| VCS | `delete_vcs_root_property` | No | Yes |
| VCS | `update_vcs_root_properties` | No | Yes |
| Agents | `list_agents` | No | Yes |
| Agents | `list_agent_pools` | No | Yes |
| Agents | `get_agent_enabled_info` | No | Yes |
| Agents | `authorize_agent` | No | Yes |
| Agents | `assign_agent_to_pool` | No | Yes |
| Agents | `set_agent_enabled` | No | Yes |
| Agents | `bulk_set_agents_enabled` | No | Yes |
| Agents | `manage_agent_requirements` | No | Yes |
| Compatibility | `get_compatible_agents_for_build_type` | No | Yes |
| Compatibility | `count_compatible_agents_for_build_type` | No | Yes |
| Compatibility | `get_compatible_agents_for_queued_build` | No | Yes |
| Compatibility | `get_compatible_build_types_for_agent` | No | Yes |
| Compatibility | `get_incompatible_build_types_for_agent` | No | Yes |
| Queue | `list_queued_builds` | Yes | Yes |
| Queue | `move_queued_build_to_top` | No | Yes |
| Queue | `reorder_queued_builds` | No | Yes |
| Queue | `cancel_queued_builds_for_build_type` | No | Yes |
| Queue | `cancel_queued_builds_by_locator` | No | Yes |
| Queue | `pause_queue_for_pool` | No | Yes |
| Queue | `resume_queue_for_pool` | No | Yes |
| Server | `get_server_info` | Yes | Yes |
| Server | `check_teamcity_connection` | No | Yes |
| Server | `check_availability_guard` | No | Yes |
| Server | `get_server_metrics` | No | Yes |
| Server | `list_server_health_items` | No | Yes |
| Server | `get_server_health_item` | No | Yes |
| Tests | `list_test_failures` | Yes | Yes |
| Tests | `get_test_details` | Yes | Yes |
| Tests | `list_muted_tests` | Yes | Yes |
| Tests | `mute_tests` | No | Yes |
| Changes | `list_changes` | Yes | Yes |
| Problems | `list_problems` | Yes | Yes |
| Problems | `list_problem_occurrences` | Yes | Yes |
| Investigations | `list_investigations` | Yes | Yes |
| Branches | `list_branches` | Yes | Yes |
| Users & Roles | `list_users` | No | Yes |
| Users & Roles | `list_roles` | No | Yes |

**Summary:** 77 tools total — 27 available in Dev mode, 50 Full-only.

Notes:
- Dev mode focuses on developer workflows (builds, tests, logs) and excludes infrastructure/admin tools to reduce context size (~4-5k tokens saved).
- Admin tools (agents, VCS roots, users, compatibility checks) require Full mode.
