/**
 * Detect an (unconsumed) Node readable stream, e.g. an Axios response body
 * obtained with `responseType: 'stream'`. Such a value is a socket with
 * circular references and must never be stored as error details or serialized.
 */
export const isReadableStream = (value: unknown): value is NodeJS.ReadableStream =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { pipe?: unknown }).pipe === 'function' &&
  typeof (value as { on?: unknown }).on === 'function';
