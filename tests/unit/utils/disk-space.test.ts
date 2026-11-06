import { promises as fs } from 'node:fs';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  DEFAULT_MIN_FREE_DISK_BYTES,
  InsufficientDiskSpaceError,
  assertDiskSpace,
  createDiskSpaceGuard,
} from '@/utils/disk-space';

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

const mockFreeBytes = (...freeBytes: number[]) => {
  const spy = jest.spyOn(fs, 'statfs').mockRejectedValue(new Error('unexpected statfs call'));
  freeBytes.forEach((bytes) =>
    spy.mockResolvedValueOnce({ bavail: bytes, bsize: 1 } as Awaited<ReturnType<typeof fs.statfs>>)
  );
  return spy;
};

const collect = (): { sink: Writable; written: () => string } => {
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });
  return { sink, written: () => Buffer.concat(chunks).toString() };
};

describe('assertDiskSpace', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accepts a download that leaves the default reserve free', async () => {
    mockFreeBytes(5 * GiB);

    await expect(assertDiskSpace('/data', 2 * GiB)).resolves.toBe(5 * GiB);
  });

  it('rejects a download that would eat into the default reserve', async () => {
    mockFreeBytes(2 * GiB);

    const error = await assertDiskSpace('/data', 1.5 * GiB).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InsufficientDiskSpaceError);
    expect((error as Error).message).toBe(
      'Not enough disk space in /data: 1.50 GiB needed, 2.00 GiB free, at least 1.00 GiB must stay free'
    );
  });

  it('rejects any download when the disk is already below the reserve', async () => {
    mockFreeBytes(DEFAULT_MIN_FREE_DISK_BYTES / 2);

    await expect(assertDiskSpace('/data')).rejects.toThrow(
      'Not enough disk space in /data: 512.0 MiB free, at least 1.00 GiB must stay free'
    );
  });

  it('honors a custom reserve', async () => {
    mockFreeBytes(2 * GiB, 2 * GiB);

    await expect(assertDiskSpace('/data', 1.5 * GiB, 256 * MiB)).resolves.toBe(2 * GiB);
    await expect(assertDiskSpace('/data', 1.5 * GiB, 600 * MiB)).rejects.toThrow(
      'at least 600.0 MiB must stay free'
    );
  });

  it('still rejects a download larger than the free space without a reserve', async () => {
    mockFreeBytes(2 * GiB);

    await expect(assertDiskSpace('/data', 3 * GiB, 0)).rejects.toThrow(
      '3.00 GiB needed, 2.00 GiB free'
    );
  });
});

describe('createDiskSpaceGuard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passes data through while enough space stays free', async () => {
    mockFreeBytes(5 * GiB, 5 * GiB, 5 * GiB);
    const { sink, written } = collect();

    await pipeline(
      Readable.from(['ab', 'cd', 'ef']),
      createDiskSpaceGuard('/data', 5 * GiB, DEFAULT_MIN_FREE_DISK_BYTES, 2),
      sink
    );

    expect(written()).toBe('abcdef');
  });

  it('aborts the transfer once the disk reports less free space than the reserve', async () => {
    mockFreeBytes(5 * GiB, 512 * MiB);
    const { sink, written } = collect();

    await expect(
      pipeline(
        Readable.from(['ab', 'cd', 'ef']),
        createDiskSpaceGuard('/data', 5 * GiB, DEFAULT_MIN_FREE_DISK_BYTES, 2),
        sink
      )
    ).rejects.toBeInstanceOf(InsufficientDiskSpaceError);
    expect(written()).toBe('ab');
  });

  it('aborts on its own byte count while the disk still reports stale free space', async () => {
    const reserve = 100 * MiB;
    mockFreeBytes(reserve + 3, reserve + 3);
    const { sink, written } = collect();

    await expect(
      pipeline(
        Readable.from(['ab', 'cd', 'ef']),
        createDiskSpaceGuard('/data', reserve + 3, reserve, 2),
        sink
      )
    ).rejects.toThrow('at least 100.0 MiB must stay free');
    expect(written()).toBe('ab');
  });

  it('keeps going below the default reserve when a smaller one is configured', async () => {
    mockFreeBytes(512 * MiB, 512 * MiB);
    const { sink, written } = collect();

    await pipeline(
      Readable.from(['ab', 'cd']),
      createDiskSpaceGuard('/data', 512 * MiB, 100 * MiB, 2),
      sink
    );

    expect(written()).toBe('abcd');
  });
});
