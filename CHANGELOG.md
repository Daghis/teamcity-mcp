# Changelog

## [Unreleased]

### Features

* **tools:** expose change, problem, investigation, mute, versioned-settings, and user/role MCP tools ([#107](https://github.com/Daghis/teamcity-mcp/issues/107))

## [1.2.1](https://github.com/Daghis/teamcity-mcp/compare/v1.2.0...v1.2.1) (2025-09-16)


### Bug Fixes

* **tools:** ensure multi-ref branchSpec; remove alias logic ([#103](https://github.com/Daghis/teamcity-mcp/issues/103)) ([5012439](https://github.com/Daghis/teamcity-mcp/commit/5012439caa926422960d5ac569579a3a725732ad))

## [1.2.0](https://github.com/Daghis/teamcity-mcp/compare/v1.1.0...v1.2.0) (2025-09-15)


### Features

* **tools:** add VCS root property management tools + integration test ([#95](https://github.com/Daghis/teamcity-mcp/issues/95)) ([13bbe17](https://github.com/Daghis/teamcity-mcp/commit/13bbe178564a53564aad4fcdb99bb3f2e5db4cb8))

## [1.1.0](https://github.com/Daghis/teamcity-mcp/compare/v1.0.6...v1.1.0) (2025-09-14)


### Features

* **utils:** add TeamCity service message escaping ([#85](https://github.com/Daghis/teamcity-mcp/issues/85)) ([6ee3b72](https://github.com/Daghis/teamcity-mcp/commit/6ee3b72e4db065faa0e01c7046328e1d4e1375c8))

## [1.0.6](https://github.com/Daghis/teamcity-mcp/compare/v1.0.5...v1.0.6) (2025-09-14)


### Bug Fixes

* authorize_agent uses authorizedInfo JSON endpoint (TeamCity 2025.07 compatibility) ([#83](https://github.com/Daghis/teamcity-mcp/issues/83)) ([198fd02](https://github.com/Daghis/teamcity-mcp/commit/198fd02ca8b6e89d83f87a1a94aafeadda593504)), closes [#78](https://github.com/Daghis/teamcity-mcp/issues/78)

## [1.0.5](https://github.com/Daghis/teamcity-mcp/compare/v1.0.4...v1.0.5) (2025-09-14)


### Bug Fixes

* delete_parameter: correct endpoint + arg order ([#84](https://github.com/Daghis/teamcity-mcp/issues/84)) ([9832821](https://github.com/Daghis/teamcity-mcp/commit/9832821e65fd945ec5ff0da2b85f744f413e7782))

## [1.0.4](https://github.com/Daghis/teamcity-mcp/compare/v1.0.3...v1.0.4) (2025-09-12)


### Bug Fixes

* **health:** accept empty locator; normalize category; fallback on 400 ([#76](https://github.com/Daghis/teamcity-mcp/issues/76)) ([174c8e9](https://github.com/Daghis/teamcity-mcp/commit/174c8e932301b1b2262bfb704a73c4647520d3bf)), closes [#75](https://github.com/Daghis/teamcity-mcp/issues/75)

## [1.0.2](https://github.com/Daghis/teamcity-mcp/compare/v1.0.1...v1.0.2) (2025-09-12)


### Bug Fixes

* trigger 1.0.2 release (no functional change) ([392be27](https://github.com/Daghis/teamcity-mcp/commit/392be27fe705d55fb8a3057120ff5e2c0a41ca8a))

## [1.0.1](https://github.com/Daghis/teamcity-mcp/compare/v1.0.0...v1.0.1) (2025-09-12)


### Bug Fixes

* **tools:** update_build_config uses 'settings/artifactRules' path; add tests ([#66](https://github.com/Daghis/teamcity-mcp/issues/66)) ([8b8afc6](https://github.com/Daghis/teamcity-mcp/commit/8b8afc6f41038bcde21a50a8662f90fa4acb7e9a))

## [1.0.0](https://github.com/Daghis/teamcity-mcp/compare/v0.9.2...v1.0.0) (2025-09-12)

### Features
- 1.0 release: stabilize API surface and defaults

### Docs
- Add Claude Code setup command and context usage estimates (dev vs full)

## [0.9.2](https://github.com/Daghis/teamcity-mcp/compare/v0.9.1...v0.9.2) (2025-09-12)

### Bug Fixes
- Fix npx execution by ensuring single shebang in dist/index.js
- Add .npmignore to reduce package size from 9.5MB to 3.4MB (1136 files to 8 files)
- Add missing external dependencies to build script (axios, ajv, inversify, etc.)

## [0.9.1](https://github.com/Daghis/teamcity-mcp/compare/v0.9.0...v0.9.1) (2025-09-12)

### Bug Fixes
- Fix CLI execution via npx by removing duplicate shebang line in `src/index.ts` and relying on build banner. This resolves `sh: teamcity-mcp: command not found` / `Invalid or unexpected token` when running `npx -y @daghis/teamcity-mcp`.

## [0.2.1](https://github.com/Daghis/teamcity-mcp/compare/v0.2.0...v0.2.1) (2025-09-12)


### Bug Fixes

* **mcp:** normalize TeamCity errors and wrap server info/metrics with runTool ([#53](https://github.com/Daghis/teamcity-mcp/issues/53)) ([2c8ab85](https://github.com/Daghis/teamcity-mcp/commit/2c8ab855a85e5faec4216a498c089e3a1a93ed7b))

## [0.2.0](https://github.com/Daghis/teamcity-mcp/compare/v0.1.2...v0.2.0) (2025-09-11)


### Features

* add Codecov bundle analysis ([#28](https://github.com/Daghis/teamcity-mcp/issues/28)) ([87c3de8](https://github.com/Daghis/teamcity-mcp/commit/87c3de85af34bec5b071d82612d67ba4d5a52702))

## 0.1.2 (2025-09-11)


### Miscellaneous Chores

* release 0.1.2 ([21e2595](https://github.com/Daghis/teamcity-mcp/commit/21e25950074ed49bd3e6c571f432f27fb8bd434e))
