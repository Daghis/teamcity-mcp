/**
 * Per-request credential context using AsyncLocalStorage.
 *
 * In HTTP transport mode each incoming request carries its own TeamCity
 * credentials (URL + token). This module stores them in an AsyncLocalStorage
 * so that downstream code (e.g. TeamCityAPI.getInstance()) can transparently
 * pick them up without any changes to tool handler signatures.
 */
import { AsyncLocalStorage } from 'async_hooks';

export interface RequestCredentials {
  teamcityUrl: string;
  teamcityToken: string;
}

const credentialStore = new AsyncLocalStorage<RequestCredentials>();

/**
 * Execute `fn` with the given credentials available via `getRequestCredentials()`.
 */
export function runWithCredentials<T>(credentials: RequestCredentials, fn: () => T): T {
  return credentialStore.run(credentials, fn);
}

/**
 * Retrieve per-request credentials (if running inside `runWithCredentials`).
 * Returns `undefined` when called outside an HTTP request scope (e.g. stdio mode).
 */
export function getRequestCredentials(): RequestCredentials | undefined {
  return credentialStore.getStore();
}
