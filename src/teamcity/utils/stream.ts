import { Readable } from 'stream';

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

/**
 * Release a response body that will not be read any further. Destroying it
 * closes the underlying socket; a stream without `destroy()` is drained instead.
 */
export const destroyStream = (stream: NodeJS.ReadableStream): void => {
  // Without a listener, an error during teardown would be unhandled and crash the process.
  stream.on('error', () => undefined);
  const destroyable = stream as NodeJS.ReadableStream & { destroy?: () => unknown };
  if (typeof destroyable.destroy === 'function') {
    destroyable.destroy();
  } else {
    stream.resume();
  }
};

/**
 * Release the streamed body of a failed response before its request is retried,
 * without waiting for the server to finish sending a body nobody will read.
 */
export const discardStreamBody = (value: unknown): void => {
  if (isReadableStream(value)) {
    destroyStream(value);
  }
};

/** Normalize a stream chunk to a Buffer, keeping the bytes of binary chunks intact. */
export const toBuffer = (chunk: unknown): Buffer => {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  return chunk instanceof Uint8Array ? Buffer.from(chunk) : Buffer.from(String(chunk));
};

async function* sliceLines(
  source: NodeJS.ReadableStream,
  startLine: number,
  endLine: number | undefined
): AsyncGenerator<Buffer> {
  if (endLine !== undefined && endLine <= startLine) {
    return;
  }
  let line = 0;
  for await (const raw of source) {
    const chunk = toBuffer(raw);
    let pos = 0;
    while (pos < chunk.length) {
      const newline = chunk.indexOf(0x0a, pos);
      const stop = newline === -1 ? chunk.length : newline + 1;
      if (line >= startLine) {
        yield chunk.subarray(pos, stop);
      }
      if (newline === -1) {
        break;
      }
      line += 1;
      pos = stop;
      if (endLine !== undefined && line >= endLine) {
        return;
      }
    }
  }
}

/**
 * Restrict a line-oriented byte stream to `lineCount` lines from the zero-based
 * `startLine`. The source is destroyed once the range is complete or the returned
 * stream is destroyed, aborting the rest of the download.
 */
export const sliceStreamLines = (
  source: NodeJS.ReadableStream,
  startLine: number,
  lineCount?: number
): Readable => {
  const endLine = lineCount === undefined ? undefined : startLine + lineCount;
  const slice = Readable.from(sliceLines(source, startLine, endLine), { objectMode: false });
  // The generator only releases `source` from inside its loop, which never runs
  // for an empty range or a slice destroyed before its first read, and which Node
  // does not interrupt while it waits for data. Release the source directly.
  const destroySlice = slice._destroy.bind(slice);
  slice._destroy = (error, callback) => {
    destroyStream(source);
    destroySlice(error, callback);
  };
  return slice;
};
