# Changelog

## [0.2.2](https://github.com/Daghis/teamcity-mcp/compare/v0.2.1...v0.2.2) (2025-09-12)


### Bug Fixes

* **cli:** remove duplicate shebang in entrypoint; bump to 0.9.1 ([#59](https://github.com/Daghis/teamcity-mcp/issues/59)) ([740530d](https://github.com/Daghis/teamcity-mcp/commit/740530d7bfba6bc81a42f8057fd017a2f8cae14e))

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
