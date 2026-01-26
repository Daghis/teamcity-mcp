# Changelog

## [2.1.5](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v2.1.4...teamcity-mcp-v2.1.5) (2026-01-26)


### Bug Fixes

* **ci:** migrate from deprecated codecov/test-results-action to codecov-action ([#377](https://github.com/Daghis/teamcity-mcp/issues/377)) ([012bcc6](https://github.com/Daghis/teamcity-mcp/commit/012bcc6b7c20a3734a49edba0d44139e5dd3a2bb))

## [2.1.4](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v2.1.3...teamcity-mcp-v2.1.4) (2026-01-26)


### Bug Fixes

* **ci:** remove duplicate workflow_run trigger from publish workflow ([#375](https://github.com/Daghis/teamcity-mcp/issues/375)) ([f9dcca8](https://github.com/Daghis/teamcity-mcp/commit/f9dcca87c480de854b22998e0c3903d2b2cbd6e5))

## [2.1.3](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v2.1.2...teamcity-mcp-v2.1.3) (2026-01-26)


### Bug Fixes

* **tests:** eliminate race condition in boundary threshold test ([#373](https://github.com/Daghis/teamcity-mcp/issues/373)) ([d4efddf](https://github.com/Daghis/teamcity-mcp/commit/d4efddfd5b4b31f6e8a8901571f01143912e0a55))

## [2.1.2](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v2.1.1...teamcity-mcp-v2.1.2) (2026-01-19)


### Bug Fixes

* **security:** override hono to 4.11.4 for JWT vulnerabilities ([#364](https://github.com/Daghis/teamcity-mcp/issues/364)) ([4f570a5](https://github.com/Daghis/teamcity-mcp/commit/4f570a546211b3d3b75e84aa3456dd1b924e5259))

## [2.1.1](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v2.1.0...teamcity-mcp-v2.1.1) (2026-01-10)


### Bug Fixes

* correct parameter endpoints and add full CRUD for all parameter types ([#358](https://github.com/Daghis/teamcity-mcp/issues/358)) ([79e92ba](https://github.com/Daghis/teamcity-mcp/commit/79e92ba1c1a9642a0253bf9d040c15d0ec072803))

## [2.1.0](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v2.0.7...teamcity-mcp-v2.1.0) (2026-01-08)


### Features

* add runtime MCP mode switching with list_changed notifications ([#355](https://github.com/Daghis/teamcity-mcp/issues/355)) ([873ba82](https://github.com/Daghis/teamcity-mcp/commit/873ba82e1329b0bc6271c15ec042093daa92499a))

## [2.0.7](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v2.0.6...teamcity-mcp-v2.0.7) (2026-01-05)


### Bug Fixes

* revert to 2025-12-11 schema (compatible with mcp-publisher v1.4.0) ([#352](https://github.com/Daghis/teamcity-mcp/issues/352)) ([05e05c2](https://github.com/Daghis/teamcity-mcp/commit/05e05c2a8b7e70326a43a7b6554987378da17c9a))

## [2.0.6](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v2.0.5...teamcity-mcp-v2.0.6) (2026-01-05)


### Bug Fixes

* update mcp-publisher to v1.4.0 ([#350](https://github.com/Daghis/teamcity-mcp/issues/350)) ([a4fb2b9](https://github.com/Daghis/teamcity-mcp/commit/a4fb2b960d04b8e9668232413119026fd79ba9d0))

## [2.0.5](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v2.0.4...teamcity-mcp-v2.0.5) (2026-01-05)


### Bug Fixes

* use draft MCP registry schema instead of dated versions ([#348](https://github.com/Daghis/teamcity-mcp/issues/348)) ([51c8216](https://github.com/Daghis/teamcity-mcp/commit/51c8216960afe3774128b01508dd4a5c8fca8f67))

## [2.0.4](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v2.0.3...teamcity-mcp-v2.0.4) (2026-01-05)


### Bug Fixes

* update MCP registry schema to 2025-12-11 ([#346](https://github.com/Daghis/teamcity-mcp/issues/346)) ([4eaec92](https://github.com/Daghis/teamcity-mcp/commit/4eaec92843b47005ad773b00837fd1a021c1cffa))

## [2.0.3](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v2.0.2...teamcity-mcp-v2.0.3) (2026-01-05)


### Bug Fixes

* add type parameter to manage_agent_requirements ([#338](https://github.com/Daghis/teamcity-mcp/issues/338)) ([#343](https://github.com/Daghis/teamcity-mcp/issues/343)) ([5545257](https://github.com/Daghis/teamcity-mcp/commit/5545257823f442cf27e9313f11f1dd0b71115af3))

## [2.0.2](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v2.0.1...teamcity-mcp-v2.0.2) (2026-01-05)


### Bug Fixes

* resolve HTTP 406 when updating build configuration fields ([#339](https://github.com/Daghis/teamcity-mcp/issues/339)) ([#341](https://github.com/Daghis/teamcity-mcp/issues/341)) ([16b1dd2](https://github.com/Daghis/teamcity-mcp/commit/16b1dd207978d63ad9824c9b7eecbbd4a9badc94))

## [2.0.1](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v2.0.0...teamcity-mcp-v2.0.1) (2025-12-23)


### Bug Fixes

* resolve HTTP 400 when updating artifactRules via update_build_config ([#335](https://github.com/Daghis/teamcity-mcp/issues/335)) ([21614ad](https://github.com/Daghis/teamcity-mcp/commit/21614ad9af4e7a519a0ece0d7c41b90a10f74a73))

## [2.0.0](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.13.1...teamcity-mcp-v2.0.0) (2025-12-22)


### ⚠ BREAKING CHANGES

* 15 tools moved from Dev mode to Full-only mode.

### Features

* reduce dev mode tool surface ([#332](https://github.com/Daghis/teamcity-mcp/issues/332)) ([3a2bd6d](https://github.com/Daghis/teamcity-mcp/commit/3a2bd6dd72cc4b2d8c5cca1bb22867b1c7e19d12))

## [1.13.1](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.13.0...teamcity-mcp-v1.13.1) (2025-12-22)


### Bug Fixes

* tune codecov PR comment behavior ([#329](https://github.com/Daghis/teamcity-mcp/issues/329)) ([a790ab1](https://github.com/Daghis/teamcity-mcp/commit/a790ab18cf08a755f930ed73639c958c7b096b55))

## [1.13.0](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.12.1...teamcity-mcp-v1.13.0) (2025-12-22)


### Features

* add CLI argument support for Windows workaround ([#320](https://github.com/Daghis/teamcity-mcp/issues/320)) ([#326](https://github.com/Daghis/teamcity-mcp/issues/326)) ([cc05a4d](https://github.com/Daghis/teamcity-mcp/commit/cc05a4dd19c1d7e1f547cdd35bb910035141909d))

## [1.12.1](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.12.0...teamcity-mcp-v1.12.1) (2025-12-22)


### Bug Fixes

* handle queued builds in get_build and get_build_status ([#324](https://github.com/Daghis/teamcity-mcp/issues/324)) ([4cb2dab](https://github.com/Daghis/teamcity-mcp/commit/4cb2dabfc9161e07708a899622d78b886742459d))

## [1.12.0](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.20...teamcity-mcp-v1.12.0) (2025-12-06)


### Features

* add type safety standards and test utilities for [#158](https://github.com/Daghis/teamcity-mcp/issues/158) ([#314](https://github.com/Daghis/teamcity-mcp/issues/314)) ([1f89a25](https://github.com/Daghis/teamcity-mcp/commit/1f89a25a63fca111f04e96763b4d17888f91bc2a))

## [1.11.20](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.19...teamcity-mcp-v1.11.20) (2025-12-06)


### Bug Fixes

* **security:** address remaining dependabot security alerts ([#312](https://github.com/Daghis/teamcity-mcp/issues/312)) ([f909460](https://github.com/Daghis/teamcity-mcp/commit/f9094607b3b980c63214185b57c74799e9315b66))

## [1.11.19](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.18...teamcity-mcp-v1.11.19) (2025-12-06)


### Bug Fixes

* **security:** address CodeQL shell command injection alerts ([#310](https://github.com/Daghis/teamcity-mcp/issues/310)) ([de8ff77](https://github.com/Daghis/teamcity-mcp/commit/de8ff77d4846dc950900db9200ac3b62bd1137b6))

## [1.11.18](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.17...teamcity-mcp-v1.11.18) (2025-12-06)


### Bug Fixes

* **security:** address CodeQL regex injection alert in cleanup.ts ([#307](https://github.com/Daghis/teamcity-mcp/issues/307)) ([6d1b63c](https://github.com/Daghis/teamcity-mcp/commit/6d1b63c400e67042e98aeaa1465a92b9bb2babf9))

## [1.11.17](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.16...teamcity-mcp-v1.11.17) (2025-12-06)


### Bug Fixes

* **security:** address CodeQL incomplete string escaping alert ([#305](https://github.com/Daghis/teamcity-mcp/issues/305)) ([24071ed](https://github.com/Daghis/teamcity-mcp/commit/24071ed1e308d699f8f5e52075eb0d53b91f6a2e))

## [1.11.16](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.15...teamcity-mcp-v1.11.16) (2025-12-06)


### Bug Fixes

* update @modelcontextprotocol/sdk to 1.24.0 to address CVE-2025-66414 ([#302](https://github.com/Daghis/teamcity-mcp/issues/302)) ([851ad8f](https://github.com/Daghis/teamcity-mcp/commit/851ad8fc4b037195243c60aec44711072d3d7ca7))

## [1.11.15](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.14...teamcity-mcp-v1.11.15) (2025-12-06)


### Bug Fixes

* package hygiene - exclude unnecessary files from npm package ([#300](https://github.com/Daghis/teamcity-mcp/issues/300)) ([da79eb6](https://github.com/Daghis/teamcity-mcp/commit/da79eb6c8a3d661f771d7268b976276628038502))

## [1.11.14](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.13...teamcity-mcp-v1.11.14) (2025-12-06)


### Bug Fixes

* Convert agent requirements and artifact dependencies to use XML format ([#294](https://github.com/Daghis/teamcity-mcp/issues/294)) ([a9bd9b7](https://github.com/Daghis/teamcity-mcp/commit/a9bd9b7a5710e03a0b8d2f2f35e703fc08aa5e85))

## [1.11.13](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.12...teamcity-mcp-v1.11.13) (2025-12-06)


### Bug Fixes

* correct MCP name case to match GitHub username ([#292](https://github.com/Daghis/teamcity-mcp/issues/292)) ([7dd59c4](https://github.com/Daghis/teamcity-mcp/commit/7dd59c41df18b134a764d1ad3e90efa5e2a9ba30))

## [1.11.12](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.11...teamcity-mcp-v1.11.12) (2025-12-06)


### Bug Fixes

* update MCP registry schema to 2025-10-17 ([#290](https://github.com/Daghis/teamcity-mcp/issues/290)) ([bc54888](https://github.com/Daghis/teamcity-mcp/commit/bc54888a6a483bf19b7c35518f88705dfe7e1ecd))

## [1.11.11](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.10...teamcity-mcp-v1.11.11) (2025-12-06)


### Bug Fixes

* update MCP server schema to 2025-09-29 ([#288](https://github.com/Daghis/teamcity-mcp/issues/288)) ([5069bd2](https://github.com/Daghis/teamcity-mcp/commit/5069bd292ac40c0ba9224ba170414dcb0956810a))

## [1.11.10](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.9...teamcity-mcp-v1.11.10) (2025-12-06)


### Bug Fixes

* **publish:** correct mcp-publisher download URL format ([#286](https://github.com/Daghis/teamcity-mcp/issues/286)) ([5c58c7d](https://github.com/Daghis/teamcity-mcp/commit/5c58c7daf1c94598b99a42aae3689164c55489e6))

## [1.11.9](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.8...teamcity-mcp-v1.11.9) (2025-12-06)


### Bug Fixes

* **publish:** update mcp-publisher to v1.3.10 ([#284](https://github.com/Daghis/teamcity-mcp/issues/284)) ([2b07466](https://github.com/Daghis/teamcity-mcp/commit/2b07466da3821d838face7617a74079cdf576818))

## [1.11.8](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.7...teamcity-mcp-v1.11.8) (2025-12-06)


### Bug Fixes

* **publish:** simplify OIDC workflow to match npm docs ([#282](https://github.com/Daghis/teamcity-mcp/issues/282)) ([b3e8493](https://github.com/Daghis/teamcity-mcp/commit/b3e84935cd61cceb41a6a773ca2b7aa3081306f6))

## [1.11.7](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.6...teamcity-mcp-v1.11.7) (2025-12-06)


### Bug Fixes

* **publish:** clear NODE_AUTH_TOKEN via GITHUB_ENV for OIDC ([#279](https://github.com/Daghis/teamcity-mcp/issues/279)) ([ee5eaef](https://github.com/Daghis/teamcity-mcp/commit/ee5eaefbe593e3269ca1b1fa128ef5aa75c0651e))

## [1.11.6](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.5...teamcity-mcp-v1.11.6) (2025-12-06)


### Bug Fixes

* **publish:** remove registry-url to enable npm OIDC trusted publishing ([#277](https://github.com/Daghis/teamcity-mcp/issues/277)) ([de2adbb](https://github.com/Daghis/teamcity-mcp/commit/de2adbbc422973eb3bbfe724163a627eb0d08780))

## [1.11.5](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.4...teamcity-mcp-v1.11.5) (2025-12-06)


### Bug Fixes

* **publish:** clear NODE_AUTH_TOKEN for npm OIDC trusted publishing ([#275](https://github.com/Daghis/teamcity-mcp/issues/275)) ([689d499](https://github.com/Daghis/teamcity-mcp/commit/689d499b8198dfb4d647f1c22e039477c8913b2e))

## [1.11.4](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.3...teamcity-mcp-v1.11.4) (2025-12-06)


### Bug Fixes

* **publish:** update npm for OIDC trusted publishing ([#273](https://github.com/Daghis/teamcity-mcp/issues/273)) ([6032c28](https://github.com/Daghis/teamcity-mcp/commit/6032c28b8cc6ccd47cf6cb167c360a47d98358a6))

## [1.11.3](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.2...teamcity-mcp-v1.11.3) (2025-12-06)


### Bug Fixes

* **publish:** use Node.js 22 for npm trusted publishing ([#271](https://github.com/Daghis/teamcity-mcp/issues/271)) ([3573f1e](https://github.com/Daghis/teamcity-mcp/commit/3573f1e523f441a8607050708bf42ce17fb355b0))

## [1.11.2](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.1...teamcity-mcp-v1.11.2) (2025-12-06)


### Bug Fixes

* **publish:** clarify id-token permission for trusted publishing ([#269](https://github.com/Daghis/teamcity-mcp/issues/269)) ([5e54da9](https://github.com/Daghis/teamcity-mcp/commit/5e54da9fa9cc46561aaf2673d632d7762776ad23))

## [1.11.1](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.11.0...teamcity-mcp-v1.11.1) (2025-11-04)


### Bug Fixes

* **deps:** downgrade dotenv to 16.6.1 to fix MCP stdio transport ([#255](https://github.com/Daghis/teamcity-mcp/issues/255)) ([ec85772](https://github.com/Daghis/teamcity-mcp/commit/ec857727bc90ffff513d51cb33dbb31a0fb8158e))

## [1.11.0](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.10.9...teamcity-mcp-v1.11.0) (2025-11-04)


### Features

* **server:** enable MCP client compatibility via stdio transport compliance ([#253](https://github.com/Daghis/teamcity-mcp/issues/253)) ([b51ecbe](https://github.com/Daghis/teamcity-mcp/commit/b51ecbe2751db632c332d22263c1f2f6f1cea5bc))

## [1.10.9](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.10.8...teamcity-mcp-v1.10.9) (2025-11-04)


### Bug Fixes

* **server:** keep stdio transport alive ([#247](https://github.com/Daghis/teamcity-mcp/issues/247)) ([c325cf4](https://github.com/Daghis/teamcity-mcp/commit/c325cf4d436489a91cabf0bb8e0d84087c97a1e4))
* **server:** keep stdio transport alive (247) ([3b77eea](https://github.com/Daghis/teamcity-mcp/commit/3b77eea2fc771964c78a3b011f67ffb8afdd02e9))

## [1.10.8](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.10.7...teamcity-mcp-v1.10.8) (2025-10-07)


### Bug Fixes

* **teamcity:** send snapshot options separately (238) ([fc9b313](https://github.com/Daghis/teamcity-mcp/commit/fc9b31379feccded78db5a35e1dc6f5ad13dccbd))
* **teamcity:** send snapshot options separately (238) ([6af8ea6](https://github.com/Daghis/teamcity-mcp/commit/6af8ea63dcc7dfae915a55287f3e1bc31e0a5c03))

## [1.10.7](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.10.6...teamcity-mcp-v1.10.7) (2025-10-06)


### Bug Fixes

* **teamcity:** serialize snapshot dependencies as xml ([#235](https://github.com/Daghis/teamcity-mcp/issues/235)) ([#236](https://github.com/Daghis/teamcity-mcp/issues/236)) ([9cec149](https://github.com/Daghis/teamcity-mcp/commit/9cec14934783f135b408211fefa41ba6a38391c8))

## [1.10.6](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.10.5...teamcity-mcp-v1.10.6) (2025-10-04)


### Bug Fixes

* **runtime:** replace double assertions in client tooling ([#233](https://github.com/Daghis/teamcity-mcp/issues/233)) ([08b19da](https://github.com/Daghis/teamcity-mcp/commit/08b19da78e09b03fd79c50121c4d607c715ec46a))

## [1.10.5](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.10.4...teamcity-mcp-v1.10.5) (2025-10-04)


### Bug Fixes

* **teamcity:** set dependency types when adding via tool ([#231](https://github.com/Daghis/teamcity-mcp/issues/231)) ([702764a](https://github.com/Daghis/teamcity-mcp/commit/702764a19de0a649e394d5b4679dc8ea6373dcf2))

## [1.10.4](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.10.3...teamcity-mcp-v1.10.4) (2025-10-04)


### Bug Fixes

* **tools:** normalize branch locators for list_builds ([#228](https://github.com/Daghis/teamcity-mcp/issues/228)) ([16fe7f0](https://github.com/Daghis/teamcity-mcp/commit/16fe7f0e2b46d04e66253ddb3cd9a06c5febf0b6))

## [1.10.3](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.10.2...teamcity-mcp-v1.10.3) (2025-09-27)


### Bug Fixes

* **tools:** honor trigger_build branch overrides (210) ([#223](https://github.com/Daghis/teamcity-mcp/issues/223)) ([7222c28](https://github.com/Daghis/teamcity-mcp/commit/7222c28c4fc9a307222ee9a50fa518127f5187de))

## [1.10.2](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.10.1...teamcity-mcp-v1.10.2) (2025-09-27)


### Bug Fixes

* **tools:** clone_build_config uses manager (215) ([b84d1f8](https://github.com/Daghis/teamcity-mcp/commit/b84d1f80a4233783a93dd1e3ede9a83a7cf57171))
* **tools:** clone_build_config uses manager (215) ([c4cd959](https://github.com/Daghis/teamcity-mcp/commit/c4cd959a9f35052bf95386162316a9ace5599eb6))

## [1.10.1](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.10.0...teamcity-mcp-v1.10.1) (2025-09-27)


### Bug Fixes

* **tools:** support get_build_status buildNumber (209) ([#219](https://github.com/Daghis/teamcity-mcp/issues/219)) ([efb9a00](https://github.com/Daghis/teamcity-mcp/commit/efb9a00ad697335239e7cd87c9436259df27a49c))

## [1.10.0](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.9.6...teamcity-mcp-v1.10.0) (2025-09-27)


### Features

* **tools:** add build config management tools ([#216](https://github.com/Daghis/teamcity-mcp/issues/216)) ([241c784](https://github.com/Daghis/teamcity-mcp/commit/241c78450414a1014c3ab160927c2fae7656cddb))
* **tools:** add build config management tools ([#216](https://github.com/Daghis/teamcity-mcp/issues/216)) ([c3a15e8](https://github.com/Daghis/teamcity-mcp/commit/c3a15e80ec60e413d601f10907c5a237236383f9))

## [1.9.6](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.9.5...teamcity-mcp-v1.9.6) (2025-09-25)


### Bug Fixes

* **tools:** resolve builds by number (GH-198) ([#211](https://github.com/Daghis/teamcity-mcp/issues/211)) ([abcb614](https://github.com/Daghis/teamcity-mcp/commit/abcb614364e4ba60d6e4d19faabe515fa20c7d5a))

## [1.9.5](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.9.5...teamcity-mcp-v1.9.5) (2025-09-25)


### Features

* add Codecov bundle analysis ([#28](https://github.com/Daghis/teamcity-mcp/issues/28)) ([87c3de8](https://github.com/Daghis/teamcity-mcp/commit/87c3de85af34bec5b071d82612d67ba4d5a52702))
* **publish:** automate mcp registry publishing ([#190](https://github.com/Daghis/teamcity-mcp/issues/190)) ([285b737](https://github.com/Daghis/teamcity-mcp/commit/285b737c5993332d8cf5e81e4db5be9864355701))
* **teamcity:** add runtime guards for manager responses ([#179](https://github.com/Daghis/teamcity-mcp/issues/179)) ([9d7eaef](https://github.com/Daghis/teamcity-mcp/commit/9d7eaef161e675246d317603df47f7f39407b7d8))
* **teamcity:** add streaming artifact downloads ([#161](https://github.com/Daghis/teamcity-mcp/issues/161)) ([b50b773](https://github.com/Daghis/teamcity-mcp/commit/b50b773ebee6f5cc85f4c53c98fef525e7098fe9)), closes [#151](https://github.com/Daghis/teamcity-mcp/issues/151)
* **teamcity:** add streaming artifact downloads ([#166](https://github.com/Daghis/teamcity-mcp/issues/166)) ([18830ed](https://github.com/Daghis/teamcity-mcp/commit/18830ed4805ad215518cc5a51640094adc35e31b)), closes [#151](https://github.com/Daghis/teamcity-mcp/issues/151)
* **tests:** add batched mcp tool execution ([#163](https://github.com/Daghis/teamcity-mcp/issues/163)) ([5f48060](https://github.com/Daghis/teamcity-mcp/commit/5f4806043b95686d5dac41a9d67515740b82a3f8)), closes [#162](https://github.com/Daghis/teamcity-mcp/issues/162)
* **tools:** add streaming mode to fetch_build_log ([#171](https://github.com/Daghis/teamcity-mcp/issues/171)) ([1abce69](https://github.com/Daghis/teamcity-mcp/commit/1abce69b7fa3866ac289501e2369d5d06d57d57f))
* **tools:** add VCS root property management tools + integration test ([#95](https://github.com/Daghis/teamcity-mcp/issues/95)) ([13bbe17](https://github.com/Daghis/teamcity-mcp/commit/13bbe178564a53564aad4fcdb99bb3f2e5db4cb8))
* **tools:** expose change and admin REST tools ([#112](https://github.com/Daghis/teamcity-mcp/issues/112)) ([e7f4e1e](https://github.com/Daghis/teamcity-mcp/commit/e7f4e1e74bb28572ffc3ee7a0fced6090c4f92ef))
* **tools:** support streaming artifacts in get_build_results ([#173](https://github.com/Daghis/teamcity-mcp/issues/173)) ([f95c5e4](https://github.com/Daghis/teamcity-mcp/commit/f95c5e4da9ffa80adc8b8f322c127a440c4524b5)), closes [#169](https://github.com/Daghis/teamcity-mcp/issues/169)
* **utils:** add TeamCity service message escaping ([#85](https://github.com/Daghis/teamcity-mcp/issues/85)) ([6ee3b72](https://github.com/Daghis/teamcity-mcp/commit/6ee3b72e4db065faa0e01c7046328e1d4e1375c8))


### Bug Fixes

* authorize_agent uses authorizedInfo JSON endpoint (TeamCity 2025.07 compatibility) ([#83](https://github.com/Daghis/teamcity-mcp/issues/83)) ([198fd02](https://github.com/Daghis/teamcity-mcp/commit/198fd02ca8b6e89d83f87a1a94aafeadda593504)), closes [#78](https://github.com/Daghis/teamcity-mcp/issues/78)
* **cli:** improve npx execution; release 0.9.2 ([#61](https://github.com/Daghis/teamcity-mcp/issues/61)) ([42577c3](https://github.com/Daghis/teamcity-mcp/commit/42577c3ed78dd7e29f21f6c8138d96da49582892))
* **cli:** remove duplicate shebang in entrypoint; bump to 0.9.1 ([#59](https://github.com/Daghis/teamcity-mcp/issues/59)) ([740530d](https://github.com/Daghis/teamcity-mcp/commit/740530d7bfba6bc81a42f8057fd017a2f8cae14e))
* delete_parameter: correct endpoint + arg order ([#84](https://github.com/Daghis/teamcity-mcp/issues/84)) ([9832821](https://github.com/Daghis/teamcity-mcp/commit/9832821e65fd945ec5ff0da2b85f744f413e7782))
* **health:** accept empty locator; normalize category; fallback on 400 ([#76](https://github.com/Daghis/teamcity-mcp/issues/76)) ([174c8e9](https://github.com/Daghis/teamcity-mcp/commit/174c8e932301b1b2262bfb704a73c4647520d3bf)), closes [#75](https://github.com/Daghis/teamcity-mcp/issues/75)
* **mcp:** normalize TeamCity errors and wrap server info/metrics with runTool ([#53](https://github.com/Daghis/teamcity-mcp/issues/53)) ([2c8ab85](https://github.com/Daghis/teamcity-mcp/commit/2c8ab855a85e5faec4216a498c089e3a1a93ed7b))
* **release:** restore 1.9.4 version metadata ([#205](https://github.com/Daghis/teamcity-mcp/issues/205)) ([c10c436](https://github.com/Daghis/teamcity-mcp/commit/c10c4362934f3af116e7d22537481aaceceeff40))
* **teamcity:** expose unified adapter surface ([#129](https://github.com/Daghis/teamcity-mcp/issues/129)) ([b0b15e8](https://github.com/Daghis/teamcity-mcp/commit/b0b15e8597d5a79c064388be38c3ffe9c0e1fc09)), closes [#114](https://github.com/Daghis/teamcity-mcp/issues/114)
* **teamcity:** resolve nested artifact downloads ([#188](https://github.com/Daghis/teamcity-mcp/issues/188)) ([e309b90](https://github.com/Daghis/teamcity-mcp/commit/e309b90de42fe121f072fe5b549ab25df3a91aaf))
* **teamcity:** restore artifact rules update compatibility ([#185](https://github.com/Daghis/teamcity-mcp/issues/185)) ([1d67268](https://github.com/Daghis/teamcity-mcp/commit/1d67268e6ee837db38ab9be27a94a5f3e072ab83))
* **teamcity:** retain adapter api credentials ([#138](https://github.com/Daghis/teamcity-mcp/issues/138)) ([3ad31ed](https://github.com/Daghis/teamcity-mcp/commit/3ad31edf227eac904eee84ec3a80d16455ae37fc)), closes [#135](https://github.com/Daghis/teamcity-mcp/issues/135)
* **teamcity:** route results + problems via shared client ([#111](https://github.com/Daghis/teamcity-mcp/issues/111)) ([3797bb5](https://github.com/Daghis/teamcity-mcp/commit/3797bb57d8421e2cb243112a9b1cdfda92fff1f7))
* **tools:** accept multi-line scripts + prep 1.9.5 (GH-200) ([#207](https://github.com/Daghis/teamcity-mcp/issues/207)) ([e9bf9d0](https://github.com/Daghis/teamcity-mcp/commit/e9bf9d041e7abc0c4d438a4bdf54a9211b9a61f2))
* **tools:** allow manage_build_steps updates ([#182](https://github.com/Daghis/teamcity-mcp/issues/182)) ([2c6bea0](https://github.com/Daghis/teamcity-mcp/commit/2c6bea0cf6770d22068b9e4b733542a056399148))
* **tools:** ensure multi-ref branchSpec; remove alias logic ([#103](https://github.com/Daghis/teamcity-mcp/issues/103)) ([5012439](https://github.com/Daghis/teamcity-mcp/commit/5012439caa926422960d5ac569579a3a725732ad))
* **tools:** harden batch artifact streaming outputs ([#177](https://github.com/Daghis/teamcity-mcp/issues/177)) ([0874325](https://github.com/Daghis/teamcity-mcp/commit/0874325c77aa2a79050cff57fced0aeec5a55ba0))
* **tools:** merge build step defaults during update (199) ([#203](https://github.com/Daghis/teamcity-mcp/issues/203)) ([43a668f](https://github.com/Daghis/teamcity-mcp/commit/43a668f0bdc3b0f69c6a3bca0e2a47c49f1cd1a7))
* **tools:** migrate MCP handlers to unified client ([#141](https://github.com/Daghis/teamcity-mcp/issues/141)) ([bc3a909](https://github.com/Daghis/teamcity-mcp/commit/bc3a909f6eb8c30798865c8b48604aca5405efc8))
* **tools:** repair manage_build_steps updates ([#154](https://github.com/Daghis/teamcity-mcp/issues/154)) ([b557e44](https://github.com/Daghis/teamcity-mcp/commit/b557e4424d5129de9d3b6e3240e1a876488da040))
* **tools:** stabilize batch artifact downloads ([#175](https://github.com/Daghis/teamcity-mcp/issues/175)) ([91a0ec3](https://github.com/Daghis/teamcity-mcp/commit/91a0ec33ac61e680dd34393fca46914e2ba3fe7f))
* **tools:** update_build_config uses 'settings/artifactRules' path; add tests ([#66](https://github.com/Daghis/teamcity-mcp/issues/66)) ([8b8afc6](https://github.com/Daghis/teamcity-mcp/commit/8b8afc6f41038bcde21a50a8662f90fa4acb7e9a))
* trigger 1.0.2 release (no functional change) ([392be27](https://github.com/Daghis/teamcity-mcp/commit/392be27fe705d55fb8a3057120ff5e2c0a41ca8a))
* trigger 1.0.3 release (no functional change) ([069212a](https://github.com/Daghis/teamcity-mcp/commit/069212a181861b17e7a1d5cfda05b40c2d11e933))


### Miscellaneous Chores

* release 0.1.2 ([21e2595](https://github.com/Daghis/teamcity-mcp/commit/21e25950074ed49bd3e6c571f432f27fb8bd434e))

## [0.1.2](https://github.com/Daghis/teamcity-mcp/compare/teamcity-mcp-v1.9.4...teamcity-mcp-v0.1.2) (2025-09-25)


### Features

* add Codecov bundle analysis ([#28](https://github.com/Daghis/teamcity-mcp/issues/28)) ([87c3de8](https://github.com/Daghis/teamcity-mcp/commit/87c3de85af34bec5b071d82612d67ba4d5a52702))
* **publish:** automate mcp registry publishing ([#190](https://github.com/Daghis/teamcity-mcp/issues/190)) ([285b737](https://github.com/Daghis/teamcity-mcp/commit/285b737c5993332d8cf5e81e4db5be9864355701))
* **teamcity:** add runtime guards for manager responses ([#179](https://github.com/Daghis/teamcity-mcp/issues/179)) ([9d7eaef](https://github.com/Daghis/teamcity-mcp/commit/9d7eaef161e675246d317603df47f7f39407b7d8))
* **teamcity:** add streaming artifact downloads ([#161](https://github.com/Daghis/teamcity-mcp/issues/161)) ([b50b773](https://github.com/Daghis/teamcity-mcp/commit/b50b773ebee6f5cc85f4c53c98fef525e7098fe9)), closes [#151](https://github.com/Daghis/teamcity-mcp/issues/151)
* **teamcity:** add streaming artifact downloads ([#166](https://github.com/Daghis/teamcity-mcp/issues/166)) ([18830ed](https://github.com/Daghis/teamcity-mcp/commit/18830ed4805ad215518cc5a51640094adc35e31b)), closes [#151](https://github.com/Daghis/teamcity-mcp/issues/151)
* **tests:** add batched mcp tool execution ([#163](https://github.com/Daghis/teamcity-mcp/issues/163)) ([5f48060](https://github.com/Daghis/teamcity-mcp/commit/5f4806043b95686d5dac41a9d67515740b82a3f8)), closes [#162](https://github.com/Daghis/teamcity-mcp/issues/162)
* **tools:** add streaming mode to fetch_build_log ([#171](https://github.com/Daghis/teamcity-mcp/issues/171)) ([1abce69](https://github.com/Daghis/teamcity-mcp/commit/1abce69b7fa3866ac289501e2369d5d06d57d57f))
* **tools:** add VCS root property management tools + integration test ([#95](https://github.com/Daghis/teamcity-mcp/issues/95)) ([13bbe17](https://github.com/Daghis/teamcity-mcp/commit/13bbe178564a53564aad4fcdb99bb3f2e5db4cb8))
* **tools:** expose change and admin REST tools ([#112](https://github.com/Daghis/teamcity-mcp/issues/112)) ([e7f4e1e](https://github.com/Daghis/teamcity-mcp/commit/e7f4e1e74bb28572ffc3ee7a0fced6090c4f92ef))
* **tools:** support streaming artifacts in get_build_results ([#173](https://github.com/Daghis/teamcity-mcp/issues/173)) ([f95c5e4](https://github.com/Daghis/teamcity-mcp/commit/f95c5e4da9ffa80adc8b8f322c127a440c4524b5)), closes [#169](https://github.com/Daghis/teamcity-mcp/issues/169)
* **utils:** add TeamCity service message escaping ([#85](https://github.com/Daghis/teamcity-mcp/issues/85)) ([6ee3b72](https://github.com/Daghis/teamcity-mcp/commit/6ee3b72e4db065faa0e01c7046328e1d4e1375c8))


### Bug Fixes

* authorize_agent uses authorizedInfo JSON endpoint (TeamCity 2025.07 compatibility) ([#83](https://github.com/Daghis/teamcity-mcp/issues/83)) ([198fd02](https://github.com/Daghis/teamcity-mcp/commit/198fd02ca8b6e89d83f87a1a94aafeadda593504)), closes [#78](https://github.com/Daghis/teamcity-mcp/issues/78)
* **cli:** improve npx execution; release 0.9.2 ([#61](https://github.com/Daghis/teamcity-mcp/issues/61)) ([42577c3](https://github.com/Daghis/teamcity-mcp/commit/42577c3ed78dd7e29f21f6c8138d96da49582892))
* **cli:** remove duplicate shebang in entrypoint; bump to 0.9.1 ([#59](https://github.com/Daghis/teamcity-mcp/issues/59)) ([740530d](https://github.com/Daghis/teamcity-mcp/commit/740530d7bfba6bc81a42f8057fd017a2f8cae14e))
* delete_parameter: correct endpoint + arg order ([#84](https://github.com/Daghis/teamcity-mcp/issues/84)) ([9832821](https://github.com/Daghis/teamcity-mcp/commit/9832821e65fd945ec5ff0da2b85f744f413e7782))
* **health:** accept empty locator; normalize category; fallback on 400 ([#76](https://github.com/Daghis/teamcity-mcp/issues/76)) ([174c8e9](https://github.com/Daghis/teamcity-mcp/commit/174c8e932301b1b2262bfb704a73c4647520d3bf)), closes [#75](https://github.com/Daghis/teamcity-mcp/issues/75)
* **mcp:** normalize TeamCity errors and wrap server info/metrics with runTool ([#53](https://github.com/Daghis/teamcity-mcp/issues/53)) ([2c8ab85](https://github.com/Daghis/teamcity-mcp/commit/2c8ab855a85e5faec4216a498c089e3a1a93ed7b))
* **release:** restore 1.9.4 version metadata ([#205](https://github.com/Daghis/teamcity-mcp/issues/205)) ([c10c436](https://github.com/Daghis/teamcity-mcp/commit/c10c4362934f3af116e7d22537481aaceceeff40))
* **teamcity:** expose unified adapter surface ([#129](https://github.com/Daghis/teamcity-mcp/issues/129)) ([b0b15e8](https://github.com/Daghis/teamcity-mcp/commit/b0b15e8597d5a79c064388be38c3ffe9c0e1fc09)), closes [#114](https://github.com/Daghis/teamcity-mcp/issues/114)
* **teamcity:** resolve nested artifact downloads ([#188](https://github.com/Daghis/teamcity-mcp/issues/188)) ([e309b90](https://github.com/Daghis/teamcity-mcp/commit/e309b90de42fe121f072fe5b549ab25df3a91aaf))
* **teamcity:** restore artifact rules update compatibility ([#185](https://github.com/Daghis/teamcity-mcp/issues/185)) ([1d67268](https://github.com/Daghis/teamcity-mcp/commit/1d67268e6ee837db38ab9be27a94a5f3e072ab83))
* **teamcity:** retain adapter api credentials ([#138](https://github.com/Daghis/teamcity-mcp/issues/138)) ([3ad31ed](https://github.com/Daghis/teamcity-mcp/commit/3ad31edf227eac904eee84ec3a80d16455ae37fc)), closes [#135](https://github.com/Daghis/teamcity-mcp/issues/135)
* **teamcity:** route results + problems via shared client ([#111](https://github.com/Daghis/teamcity-mcp/issues/111)) ([3797bb5](https://github.com/Daghis/teamcity-mcp/commit/3797bb57d8421e2cb243112a9b1cdfda92fff1f7))
* **tools:** allow manage_build_steps updates ([#182](https://github.com/Daghis/teamcity-mcp/issues/182)) ([2c6bea0](https://github.com/Daghis/teamcity-mcp/commit/2c6bea0cf6770d22068b9e4b733542a056399148))
* **tools:** ensure multi-ref branchSpec; remove alias logic ([#103](https://github.com/Daghis/teamcity-mcp/issues/103)) ([5012439](https://github.com/Daghis/teamcity-mcp/commit/5012439caa926422960d5ac569579a3a725732ad))
* **tools:** harden batch artifact streaming outputs ([#177](https://github.com/Daghis/teamcity-mcp/issues/177)) ([0874325](https://github.com/Daghis/teamcity-mcp/commit/0874325c77aa2a79050cff57fced0aeec5a55ba0))
* **tools:** merge build step defaults during update (199) ([#203](https://github.com/Daghis/teamcity-mcp/issues/203)) ([43a668f](https://github.com/Daghis/teamcity-mcp/commit/43a668f0bdc3b0f69c6a3bca0e2a47c49f1cd1a7))
* **tools:** migrate MCP handlers to unified client ([#141](https://github.com/Daghis/teamcity-mcp/issues/141)) ([bc3a909](https://github.com/Daghis/teamcity-mcp/commit/bc3a909f6eb8c30798865c8b48604aca5405efc8))
* **tools:** repair manage_build_steps updates ([#154](https://github.com/Daghis/teamcity-mcp/issues/154)) ([b557e44](https://github.com/Daghis/teamcity-mcp/commit/b557e4424d5129de9d3b6e3240e1a876488da040))
* **tools:** stabilize batch artifact downloads ([#175](https://github.com/Daghis/teamcity-mcp/issues/175)) ([91a0ec3](https://github.com/Daghis/teamcity-mcp/commit/91a0ec33ac61e680dd34393fca46914e2ba3fe7f))
* **tools:** update_build_config uses 'settings/artifactRules' path; add tests ([#66](https://github.com/Daghis/teamcity-mcp/issues/66)) ([8b8afc6](https://github.com/Daghis/teamcity-mcp/commit/8b8afc6f41038bcde21a50a8662f90fa4acb7e9a))
* trigger 1.0.2 release (no functional change) ([392be27](https://github.com/Daghis/teamcity-mcp/commit/392be27fe705d55fb8a3057120ff5e2c0a41ca8a))
* trigger 1.0.3 release (no functional change) ([069212a](https://github.com/Daghis/teamcity-mcp/commit/069212a181861b17e7a1d5cfda05b40c2d11e933))


### Miscellaneous Chores

* release 0.1.2 ([21e2595](https://github.com/Daghis/teamcity-mcp/commit/21e25950074ed49bd3e6c571f432f27fb8bd434e))

## [1.9.4](https://github.com/Daghis/teamcity-mcp/compare/v1.9.3...v1.9.4) (2025-09-25)

### Bug Fixes

* **tools:** merge build step defaults during update (199) ([#203](https://github.com/Daghis/teamcity-mcp/issues/203)) ([43a668f](https://github.com/Daghis/teamcity-mcp/commit/43a668f0bdc3b0f69c6a3bca0e2a47c49f1cd1a7))

## [1.9.3](https://github.com/Daghis/teamcity-mcp/compare/v1.9.2...v1.9.3) (2025-09-21)


### Bug Fixes

* **teamcity:** resolve nested artifact downloads ([#188](https://github.com/Daghis/teamcity-mcp/issues/188)) ([e309b90](https://github.com/Daghis/teamcity-mcp/commit/e309b90de42fe121f072fe5b549ab25df3a91aaf))

## [1.9.2](https://github.com/Daghis/teamcity-mcp/compare/v1.9.1...v1.9.2) (2025-09-21)


### Bug Fixes

* **teamcity:** restore artifact rules update compatibility ([#185](https://github.com/Daghis/teamcity-mcp/issues/185)) ([1d67268](https://github.com/Daghis/teamcity-mcp/commit/1d67268e6ee837db38ab9be27a94a5f3e072ab83))

## [1.9.1](https://github.com/Daghis/teamcity-mcp/compare/v1.9.0...v1.9.1) (2025-09-20)


### Bug Fixes

* **tools:** allow manage_build_steps updates ([#182](https://github.com/Daghis/teamcity-mcp/issues/182)) ([2c6bea0](https://github.com/Daghis/teamcity-mcp/commit/2c6bea0cf6770d22068b9e4b733542a056399148))

## [1.9.0](https://github.com/Daghis/teamcity-mcp/compare/v1.8.2...v1.9.0) (2025-09-20)


### Features

* **teamcity:** add runtime guards for manager responses ([#179](https://github.com/Daghis/teamcity-mcp/issues/179)) ([9d7eaef](https://github.com/Daghis/teamcity-mcp/commit/9d7eaef161e675246d317603df47f7f39407b7d8))

## [1.8.2](https://github.com/Daghis/teamcity-mcp/compare/v1.8.1...v1.8.2) (2025-09-20)


### Bug Fixes

* **tools:** harden batch artifact streaming outputs ([#177](https://github.com/Daghis/teamcity-mcp/issues/177)) ([0874325](https://github.com/Daghis/teamcity-mcp/commit/0874325c77aa2a79050cff57fced0aeec5a55ba0))

## [1.8.1](https://github.com/Daghis/teamcity-mcp/compare/v1.8.0...v1.8.1) (2025-09-20)


### Bug Fixes

* **tools:** stabilize batch artifact downloads ([#175](https://github.com/Daghis/teamcity-mcp/issues/175)) ([91a0ec3](https://github.com/Daghis/teamcity-mcp/commit/91a0ec33ac61e680dd34393fca46914e2ba3fe7f))

## [1.8.0](https://github.com/Daghis/teamcity-mcp/compare/v1.7.0...v1.8.0) (2025-09-20)


### Features

* **tools:** support streaming artifacts in get_build_results ([#173](https://github.com/Daghis/teamcity-mcp/issues/173)) ([f95c5e4](https://github.com/Daghis/teamcity-mcp/commit/f95c5e4da9ffa80adc8b8f322c127a440c4524b5)), closes [#169](https://github.com/Daghis/teamcity-mcp/issues/169)

## [1.7.0](https://github.com/Daghis/teamcity-mcp/compare/v1.6.0...v1.7.0) (2025-09-20)


### Features

* **tools:** add streaming mode to fetch_build_log ([#171](https://github.com/Daghis/teamcity-mcp/issues/171)) ([1abce69](https://github.com/Daghis/teamcity-mcp/commit/1abce69b7fa3866ac289501e2369d5d06d57d57f))

## [1.6.0](https://github.com/Daghis/teamcity-mcp/compare/v1.5.0...v1.6.0) (2025-09-20)


### Features

* **teamcity:** add streaming artifact downloads ([#166](https://github.com/Daghis/teamcity-mcp/issues/166)) ([18830ed](https://github.com/Daghis/teamcity-mcp/commit/18830ed4805ad215518cc5a51640094adc35e31b)), closes [#151](https://github.com/Daghis/teamcity-mcp/issues/151)

## [1.5.0](https://github.com/Daghis/teamcity-mcp/compare/v1.4.0...v1.5.0) (2025-09-20)


### Features

* **teamcity:** add streaming artifact downloads ([#161](https://github.com/Daghis/teamcity-mcp/issues/161)) ([b50b773](https://github.com/Daghis/teamcity-mcp/commit/b50b773ebee6f5cc85f4c53c98fef525e7098fe9)), closes [#151](https://github.com/Daghis/teamcity-mcp/issues/151)

## [1.4.0](https://github.com/Daghis/teamcity-mcp/compare/v1.3.5...v1.4.0) (2025-09-20)


### Features

* **tests:** add batched mcp tool execution ([#163](https://github.com/Daghis/teamcity-mcp/issues/163)) ([5f48060](https://github.com/Daghis/teamcity-mcp/commit/5f4806043b95686d5dac41a9d67515740b82a3f8)), closes [#162](https://github.com/Daghis/teamcity-mcp/issues/162)

## [1.3.5](https://github.com/Daghis/teamcity-mcp/compare/v1.3.4...v1.3.5) (2025-09-19)


### Bug Fixes

* **tools:** repair manage_build_steps updates ([#154](https://github.com/Daghis/teamcity-mcp/issues/154)) ([b557e44](https://github.com/Daghis/teamcity-mcp/commit/b557e4424d5129de9d3b6e3240e1a876488da040))

## [1.3.4](https://github.com/Daghis/teamcity-mcp/compare/v1.3.3...v1.3.4) (2025-09-19)


### Bug Fixes

* **tools:** migrate MCP handlers to unified client ([#141](https://github.com/Daghis/teamcity-mcp/issues/141)) ([bc3a909](https://github.com/Daghis/teamcity-mcp/commit/bc3a909f6eb8c30798865c8b48604aca5405efc8))

## [1.3.3](https://github.com/Daghis/teamcity-mcp/compare/v1.3.2...v1.3.3) (2025-09-19)


### Bug Fixes

* **teamcity:** retain adapter api credentials ([#138](https://github.com/Daghis/teamcity-mcp/issues/138)) ([3ad31ed](https://github.com/Daghis/teamcity-mcp/commit/3ad31edf227eac904eee84ec3a80d16455ae37fc)), closes [#135](https://github.com/Daghis/teamcity-mcp/issues/135)

## [1.3.2](https://github.com/Daghis/teamcity-mcp/compare/v1.3.1...v1.3.2) (2025-09-18)


### Bug Fixes

* **teamcity:** expose unified adapter surface ([#129](https://github.com/Daghis/teamcity-mcp/issues/129)) ([b0b15e8](https://github.com/Daghis/teamcity-mcp/commit/b0b15e8597d5a79c064388be38c3ffe9c0e1fc09)), closes [#114](https://github.com/Daghis/teamcity-mcp/issues/114)

## [1.3.1](https://github.com/Daghis/teamcity-mcp/compare/v1.3.0...v1.3.1) (2025-09-16)


### Bug Fixes

* **teamcity:** route results + problems via shared client ([#111](https://github.com/Daghis/teamcity-mcp/issues/111)) ([3797bb5](https://github.com/Daghis/teamcity-mcp/commit/3797bb57d8421e2cb243112a9b1cdfda92fff1f7))

## [1.3.0](https://github.com/Daghis/teamcity-mcp/compare/v1.2.1...v1.3.0) (2025-09-16)


### Features

* **tools:** expose change and admin REST tools ([#112](https://github.com/Daghis/teamcity-mcp/issues/112)) ([e7f4e1e](https://github.com/Daghis/teamcity-mcp/commit/e7f4e1e74bb28572ffc3ee7a0fced6090c4f92ef))

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
