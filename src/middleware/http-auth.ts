/**
 * HTTP authentication middleware for the Streamable HTTP transport.
 *
 * Extracts TeamCity credentials from incoming HTTP headers and makes them
 * available to downstream tool handlers via AsyncLocalStorage.
 *
 * Expected headers:
 *   - X-TeamCity-Url:   The base URL of the TeamCity server
 *   - X-TeamCity-Token: A valid TeamCity API token (Bearer prefix optional)
 */
import type { IncomingMessage, ServerResponse } from 'http';

import { runWithCredentials } from '@/utils/request-context';

/**
 * Express-compatible middleware that requires TeamCity credentials on every request.
 * Returns 401 if either header is missing.
 *
 * All downstream handlers (including MCP tool calls) will automatically pick
 * up the credentials via `getRequestCredentials()`.
 */
export function requireTeamCityAuth(
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void
): void {
  const tcUrl = req.headers['x-teamcity-url'];
  const tcToken = req.headers['x-teamcity-token'];

  if (typeof tcUrl !== 'string' || tcUrl.length === 0) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Missing X-TeamCity-Url header' },
        id: null,
      })
    );
    return;
  }

  if (typeof tcToken !== 'string' || tcToken.length === 0) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Missing X-TeamCity-Token header' },
        id: null,
      })
    );
    return;
  }

  // Strip optional "Bearer " prefix
  const token = tcToken.startsWith('Bearer ') ? tcToken.slice(7) : tcToken;

  // Validate URL format (basic check)
  try {
    new URL(tcUrl);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32002, message: 'Invalid X-TeamCity-Url: must be a valid URL' },
        id: null,
      })
    );
    return;
  }

  // Run the rest of the request inside the credential context
  runWithCredentials({ teamcityUrl: tcUrl, teamcityToken: token }, () => {
    next();
  });
}
