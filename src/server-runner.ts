import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

export type LifecycleTransport = {
  close?: () => Promise<void> | void;
};

/**
 * Connects the provided MCP server to the given transport and keeps the process
 * alive until the server closes or reports an unrecoverable error.
 */
export async function startServerLifecycle(
  server: Server,
  transport: LifecycleTransport
): Promise<void> {
  await server.connect(transport as never);

  return new Promise<void>((resolve, reject) => {
    const previousOnClose = server.onclose;
    const previousOnError = server.onerror;

    const cleanup = () => {
      server.onclose = previousOnClose;
      server.onerror = previousOnError;
    };

    server.onclose = () => {
      previousOnClose?.();
      cleanup();
      resolve();
    };

    server.onerror = (rawError) => {
      previousOnError?.(rawError);

      const error = rawError instanceof Error ? rawError : new Error(String(rawError));

      const closeTransport = () => {
        if (!transport.close) {
          return Promise.resolve();
        }
        try {
          return Promise.resolve(transport.close());
        } catch (closeError) {
          return Promise.reject(closeError);
        }
      };

      void closeTransport()
        .catch(() => {
          // Ignore secondary close failures; the original error is what matters.
        })
        .finally(() => {
          cleanup();
          reject(error);
        });
    };
  });
}
