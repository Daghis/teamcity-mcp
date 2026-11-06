import { promises as fs } from 'node:fs';
import { Transform } from 'node:stream';

export const DEFAULT_MIN_FREE_DISK_BYTES = 1024 ** 3;
const RECHECK_EVERY_BYTES = 64 * 1024 ** 2;

const formatBytes = (bytes: number): string =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(2)} GiB`
    : `${(bytes / 1024 ** 2).toFixed(1)} MiB`;

export class InsufficientDiskSpaceError extends Error {
  constructor(
    readonly directory: string,
    readonly freeBytes: number,
    readonly minFreeBytes: number,
    readonly requiredBytes?: number
  ) {
    const need = requiredBytes === undefined ? '' : `${formatBytes(requiredBytes)} needed, `;
    super(
      `Not enough disk space in ${directory}: ${need}${formatBytes(freeBytes)} free, ` +
        `at least ${formatBytes(minFreeBytes)} must stay free`
    );
    this.name = 'InsufficientDiskSpaceError';
  }
}

export const getFreeDiskBytes = async (directory: string): Promise<number> => {
  const stats = await fs.statfs(directory);
  return stats.bavail * stats.bsize;
};

export const assertDiskSpace = async (
  directory: string,
  requiredBytes = 0,
  minFreeBytes = DEFAULT_MIN_FREE_DISK_BYTES
): Promise<number> => {
  const freeBytes = await getFreeDiskBytes(directory);
  if (freeBytes - requiredBytes < minFreeBytes) {
    throw new InsufficientDiskSpaceError(
      directory,
      freeBytes,
      minFreeBytes,
      requiredBytes > 0 ? requiredBytes : undefined
    );
  }
  return freeBytes;
};

/** Copy-on-write filesystems such as btrfs report written data only at their next commit, so the guard also deducts the bytes it has passed on itself. */
export const createDiskSpaceGuard = (
  directory: string,
  initialFreeBytes: number,
  minFreeBytes: number,
  recheckEveryBytes = RECHECK_EVERY_BYTES
): Transform => {
  let written = 0;
  let sinceCheck = 0;
  let reportedFreeBytes = initialFreeBytes;
  const estimatedFreeBytes = () => Math.min(reportedFreeBytes, initialFreeBytes - written);
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      written += chunk.length;
      sinceCheck += chunk.length;
      if (estimatedFreeBytes() < minFreeBytes) {
        callback(new InsufficientDiskSpaceError(directory, estimatedFreeBytes(), minFreeBytes));
        return;
      }
      if (sinceCheck < recheckEveryBytes) {
        callback(null, chunk);
        return;
      }
      sinceCheck = 0;
      getFreeDiskBytes(directory).then((freeBytes) => {
        reportedFreeBytes = freeBytes;
        if (estimatedFreeBytes() < minFreeBytes) {
          callback(new InsufficientDiskSpaceError(directory, estimatedFreeBytes(), minFreeBytes));
        } else {
          callback(null, chunk);
        }
      }, callback);
    },
  });
};
