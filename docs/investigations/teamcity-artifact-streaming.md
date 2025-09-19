# TeamCity Artifact Streaming Investigation (Issue #157)

## Approach
- Reviewed the generated REST client (`builds.downloadFileOfBuild`) and the managers that consume it to confirm where we currently request buffered `ArrayBuffer` payloads.
- Queried JetBrains' public TeamCity instance via the guest REST API to observe the HTTP behaviour of artifact downloads.
- Validated client-side streaming using Axios with `responseType: 'stream'`.

## Findings
### Server behaviour
- Artifact download endpoint: `GET /app/rest/builds/id:<id>/artifacts/content/<path>`
- Headers from a real build (`buildId=5512360`, Kotlin kotlinx-atomicfu):
  ```bash
  curl -I \
    'https://teamcity.jetbrains.com/guestAuth/app/rest/builds/id:5512360/artifacts/content/atomicfu/build/libs/atomicfu-androidnativearm64-0.30.0-beta-SNAPSHOT-sources.jar'
  HTTP/2 200
  content-type: application/java-archive
  content-length: 20908
  content-disposition: atomicfu-androidnativearm64-0.30.0-beta-SNAPSHOT-sources.jar
  accept-ranges: bytes
  cache-control: max-age=86400
  ```
- Range requests are honoured, returning `206 Partial Content` and the requested slice:
  ```bash
  curl -s -D - -o /dev/null \
    -H 'Range: bytes=0-1023' \
    'https://teamcity.jetbrains.com/guestAuth/app/rest/builds/id:5512360/artifacts/content/atomicfu/build/libs/atomicfu-androidnativearm64-0.30.0-beta-SNAPSHOT-sources.jar'
  HTTP/2 206
  content-length: 1024
  ```
  This confirms the server supports resumable transfers and partial reads.

### Axios streaming
- `axios.get(url, { responseType: 'stream' })` against the same endpoint returns a Node `Readable` stream. Sample run:
  ```text
  status 200
  content-length 20908
  accept-ranges bytes
  read-bytes 13133
  ```
  (The script intentionally stopped after ~13 KB to demonstrate early cancellation.)
- The generated client already allows `{ responseType: 'stream' }` via the `options?: RawAxiosRequestConfig` parameter injected into `downloadFileOfBuild`.

### Current codebase touchpoints
- `ArtifactManager.downloadArtifact` and `BuildResultsManager.downloadArtifactContent` always request `arraybuffer`, forcing the whole payload into memory before any processing.
- `TeamCityClientAdapter.downloadArtifactContent` mirrors the buffered behaviour; helpers/tests expect `ArrayBuffer` today.

## Recommendation (Go)
- Streaming is viable with the existing REST endpoints. Introduce an opt-in path that:
  1. Extends `ArtifactDownloadOptions` with a streaming flag (e.g. `stream?: boolean` or `encoding: 'stream'`).
  2. Calls `client.modules.builds.downloadFileOfBuild` with `{ responseType: 'stream' }` when streaming is requested, returning the `Readable` to callers.
  3. Keeps the buffered behaviour as the default to avoid breaking existing consumers that expect `string`/`Buffer` payloads.
- Surface the option through MCP tools only when a client explicitly requests streaming.

## Implementation considerations for #151
- Extend the public API to distinguish between buffered encodings (`base64`, `text`, `buffer`) and streaming (`Readable`).
- Update `downloadMultipleArtifacts` to reject/short-circuit when a streamed artifact is requested alongside buffered ones (or convert to sequential processing).
- Decide whether `BuildResultsManager` should remain buffered (to continue embedding base64 data) or expose a new helper dedicated to streaming downloads.
- Tests:
  - Unit tests can stub streams via `Readable.from(['chunk'])` when the streaming flag is enabled.
  - Integrations should exercise the real axios stream path, piping into a temporary buffer/file for assertion.
- Update `MockTeamCityClient` to support returning streamed responses in addition to buffers.
- Document the flag in `TEAMCITY_MCP_TOOLS_GUIDE.md` when implemented.

## Open questions / follow-ups
- Investigate whether to expose range controls so callers can resume downloads explicitly.
- Decide if we need to disable Axios' automatic decompression (`decompress: false`) to ensure transparent streaming of already-compressed artifacts.
- Consider adding backpressure controls or progress callbacks for long-running streams consumed by CLI tools.

## Summary
TeamCity serves artifact content with `Accept-Ranges` headers and honours range requests. Axios can consume the endpoint as a stream today. We can proceed with #151 to add an opt-in streaming mode while retaining the current buffered behaviour as the default.
