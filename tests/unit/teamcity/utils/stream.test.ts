import { Readable } from 'stream';

import {
  destroyStream,
  discardStreamBody,
  isReadableStream,
  sliceStreamLines,
  toBuffer,
} from '@/teamcity/utils/stream';

describe('stream utils', () => {
  it('detects readable streams', () => {
    expect(isReadableStream(Readable.from(['a']))).toBe(true);
    expect(isReadableStream({ message: 'not a stream' })).toBe(false);
    expect(isReadableStream(null)).toBe(false);
  });

  it('drains a readable stream body', async () => {
    const body = Readable.from(['chunk-1', 'chunk-2']);
    const ended = new Promise<void>((resolve) => body.once('end', resolve));

    discardStreamBody(body);

    await expect(ended).resolves.toBeUndefined();
  });

  it('ignores non-stream bodies', () => {
    expect(() => discardStreamBody({ message: 'plain' })).not.toThrow();
    expect(() => discardStreamBody(undefined)).not.toThrow();
  });

  it('swallows errors emitted while draining', () => {
    const body = new Readable({ read: () => undefined });

    discardStreamBody(body);

    expect(() => body.destroy(new Error('socket hang up'))).not.toThrow();
    expect(body.listenerCount('error')).toBeGreaterThan(0);
  });

  it('destroys a stream and swallows errors raised while tearing it down', () => {
    const body = new Readable({ read: () => undefined });

    destroyStream(body);

    expect(body.destroyed).toBe(true);
    expect(body.listenerCount('error')).toBeGreaterThan(0);
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
