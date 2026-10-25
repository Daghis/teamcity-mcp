import { Readable } from 'stream';

import {
  destroyStream,
  discardStreamBody,
  isReadableStream,
  readLastLines,
  readLineRange,
  sliceStreamLines,
  toBuffer,
} from '@/teamcity/utils/stream';

describe('stream utils', () => {
  it('detects readable streams', () => {
    expect(isReadableStream(Readable.from(['a']))).toBe(true);
    expect(isReadableStream({ message: 'not a stream' })).toBe(false);
    expect(isReadableStream(null)).toBe(false);
  });

  it('destroys a streamed response body instead of waiting for it to finish', () => {
    const body = new Readable({ read: () => undefined });

    discardStreamBody(body);

    expect(body.destroyed).toBe(true);
  });

  it('ignores non-stream bodies', () => {
    expect(() => discardStreamBody({ message: 'plain' })).not.toThrow();
    expect(() => discardStreamBody(undefined)).not.toThrow();
  });

  it('destroys a stream and swallows errors raised while tearing it down', async () => {
    const body = new Readable({
      read: () => undefined,
      destroy: (_error, callback) => callback(new Error('socket hang up')),
    });

    destroyStream(body);
    // The teardown error is emitted on the next tick; unhandled, it would fail the test.
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(body.destroyed).toBe(true);
  });

  it('drains a stream that cannot be destroyed', () => {
    const body = new Readable({ read: () => undefined });
    Object.defineProperty(body, 'destroy', { value: undefined });

    destroyStream(body);

    expect(body.readableFlowing).toBe(true);
  });

  it('converts chunks to buffers without reinterpreting their bytes', () => {
    const buffer = Buffer.from('l0\n');

    expect(toBuffer(buffer)).toBe(buffer);
    expect(toBuffer(Uint8Array.from([108, 48, 10])).toString()).toBe('l0\n');
    expect(toBuffer('l0\n').toString()).toBe('l0\n');
  });
});

describe('sliceStreamLines', () => {
  const collect = async (stream: Readable): Promise<string> => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Buffer));
    }
    return Buffer.concat(chunks).toString();
  };

  it('returns the requested range across chunk boundaries', async () => {
    const source = Readable.from([
      Buffer.from('l0\nl'),
      Buffer.from('1\nl2\n'),
      Buffer.from('l3\n'),
    ]);

    await expect(collect(sliceStreamLines(source, 1, 2))).resolves.toBe('l1\nl2\n');
  });

  it('keeps everything from startLine when lineCount is omitted', async () => {
    const source = Readable.from([Buffer.from('l0\nl1\nl2')]);

    await expect(collect(sliceStreamLines(source, 1))).resolves.toBe('l1\nl2');
  });

  it('returns nothing for a zero line count', async () => {
    const source = Readable.from([Buffer.from('l0\nl1\n')]);

    await expect(collect(sliceStreamLines(source, 0, 0))).resolves.toBe('');
  });

  it('destroys the source once the range is complete', async () => {
    let served = 0;
    const source = new Readable({
      read() {
        served += 1;
        this.push(`line-${served}\n`);
      },
    });

    await expect(collect(sliceStreamLines(source, 0, 2))).resolves.toBe('line-1\nline-2\n');
    expect(source.destroyed).toBe(true);
  });

  it('preserves the bytes of Uint8Array chunks', async () => {
    // Object mode passes chunks through untouched, as a non-Node source would.
    const source = new Readable({ objectMode: true, read: () => undefined });
    source.push(Uint8Array.from(Buffer.from('l0\nl1\nl2\n')));
    source.push(null);

    await expect(collect(sliceStreamLines(source, 0, 2))).resolves.toBe('l0\nl1\n');
  });

  it('destroys the source when an empty range is consumed', async () => {
    const source = new Readable({ read: () => undefined });

    await expect(collect(sliceStreamLines(source, 0, 0))).resolves.toBe('');
    expect(source.destroyed).toBe(true);
  });

  it('destroys the source when the slice is destroyed before its first read', () => {
    const source = new Readable({ read: () => undefined });

    sliceStreamLines(source, 0, 5).destroy();

    expect(source.destroyed).toBe(true);
  });

  it('destroys the source when the slice is destroyed while waiting for data', async () => {
    const source = new Readable({ read: () => undefined });
    const slice = sliceStreamLines(source, 1000, 5);
    slice.resume();
    await new Promise<void>((resolve) => setImmediate(resolve));

    slice.destroy();

    expect(source.destroyed).toBe(true);
  });
});

const endlessLog = (): Readable & { served: () => number } => {
  let served = 0;
  const source = new Readable({
    read() {
      served += 1;
      this.push(`line-${served - 1}\n`);
    },
  });
  return Object.assign(source, { served: () => served });
};

describe('readLineRange', () => {
  it('returns the requested lines across chunk boundaries and CRLF splits', async () => {
    const source = Readable.from([
      Buffer.from('l0\r'),
      Buffer.from('\nl1\rl'),
      Buffer.from('2\nl3'),
    ]);

    await expect(readLineRange(source, 1, 2)).resolves.toEqual({
      lines: ['l1', 'l2'],
      startLine: 1,
      nextStartLine: 3,
    });
  });

  it('reports the total when the range reaches the end of the log', async () => {
    const source = Readable.from([Buffer.from('l0\nl1\nl2\n')]);

    await expect(readLineRange(source, 1, 5)).resolves.toEqual({
      lines: ['l1', 'l2'],
      startLine: 1,
      totalLines: 3,
    });
  });

  it('treats a carriage return at the very end as a line break', async () => {
    const source = Readable.from([Buffer.from('l0\r\nl1\r')]);

    await expect(readLineRange(source, 0, 5)).resolves.toEqual({
      lines: ['l0', 'l1'],
      startLine: 0,
      totalLines: 2,
    });
  });

  it('clamps a start beyond the end of the log', async () => {
    const source = Readable.from([Buffer.from('l0\nl1')]);

    await expect(readLineRange(source, 10, 5)).resolves.toEqual({
      lines: [],
      startLine: 2,
      totalLines: 2,
    });
  });

  it('decodes multi-byte characters split across chunks', async () => {
    const bytes = Buffer.from('größe\n');
    const source = Readable.from([bytes.subarray(0, 3), bytes.subarray(3)]);

    await expect(readLineRange(source, 0, 1)).resolves.toMatchObject({ lines: ['größe'] });
  });

  it('stops reading the source once the line after the range has arrived', async () => {
    const source = endlessLog();

    await expect(readLineRange(source, 2, 3)).resolves.toEqual({
      lines: ['line-2', 'line-3', 'line-4'],
      startLine: 2,
      nextStartLine: 5,
    });
    expect(source.destroyed).toBe(true);
    expect(source.served()).toBeLessThan(50);
  });

  it('destroys the source when reading fails', async () => {
    const source = new Readable({
      read() {
        this.destroy(new Error('socket hang up'));
      },
    });

    await expect(readLineRange(source, 0, 5)).rejects.toThrow('socket hang up');
    expect(source.destroyed).toBe(true);
  });
});

describe('readLastLines', () => {
  it('keeps only the trailing window of the log', async () => {
    const source = Readable.from([Buffer.from('l0\nl1\nl2\nl3\nl4\n')]);

    await expect(readLastLines(source, 2)).resolves.toEqual({
      lines: ['l3', 'l4'],
      totalLines: 5,
    });
  });

  it('returns the whole log when it is shorter than the window', async () => {
    const source = Readable.from([Buffer.from('l0\nl1')]);

    await expect(readLastLines(source, 5)).resolves.toEqual({
      lines: ['l0', 'l1'],
      totalLines: 2,
    });
  });

  it('counts the lines of a log without returning any for a zero window', async () => {
    const source = Readable.from([Buffer.from('l0\nl1\n')]);

    await expect(readLastLines(source, 0)).resolves.toEqual({ lines: [], totalLines: 2 });
  });

  it('returns the last lines of a long log in order', async () => {
    let served = 0;
    const source = new Readable({
      read() {
        served += 1;
        this.push(served > 10_000 ? null : `line-${served - 1}\n`);
      },
    });

    await expect(readLastLines(source, 3)).resolves.toEqual({
      lines: ['line-9997', 'line-9998', 'line-9999'],
      totalLines: 10_000,
    });
  });
});
