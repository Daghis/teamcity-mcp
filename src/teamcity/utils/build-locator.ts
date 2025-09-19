/**
 * Normalize build IDs into TeamCity locator form.
 * Supports both raw numeric IDs and pre-composed locator strings.
 */
export const toBuildLocator = (buildId: string): string =>
  buildId.includes(':') ? buildId : `id:${buildId}`;
