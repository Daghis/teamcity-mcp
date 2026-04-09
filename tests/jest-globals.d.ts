/**
 * TypeScript 6 + @types/jest v30 compatibility.
 *
 * @types/jest v30 removed `declare var jest` and only keeps `declare namespace jest`.
 * TypeScript 6 enforces that a namespace cannot be used as a value unless there is
 * a corresponding variable declaration.  This file restores the missing declaration.
 */
import type { Jest } from '@jest/environment';

declare global {
  // eslint-disable-next-line no-var
  var jest: Jest;
}
