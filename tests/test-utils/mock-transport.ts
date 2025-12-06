/**
 * Type-safe mock utilities for MCP Transport testing
 *
 * Provides properly typed mock implementations that match the Transport
 * interface without requiring dangerous `as unknown as` casts.
 */
import type { Readable, Writable } from 'node:stream';
import { PassThrough } from 'node:stream';

import type { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage, MessageExtraInfo } from '@modelcontextprotocol/sdk/types.js';

/**
 * Mock stdin interface for testing
 */
export interface MockStdin {
  on: jest.Mock;
  once: jest.Mock;
  removeListener: jest.Mock;
  setEncoding: jest.Mock;
  pause: jest.Mock;
  resume: jest.Mock;
}

/**
 * Mock stdout interface for testing
 */
export interface MockStdout {
  write: jest.Mock<boolean, [unknown, (() => void)?]>;
  on: jest.Mock;
}

/**
 * Create a mock stdin stream for testing
 *
 * @example
 * ```typescript
 * const mockStdin = createMockStdin();
 *
 * // Simulate receiving data
 * const dataHandler = mockStdin.on.mock.calls.find(([event]) => event === 'data')?.[1];
 * if (dataHandler) dataHandler(Buffer.from('{"jsonrpc":"2.0",...}'));
 * ```
 */
export function createMockStdin(): MockStdin {
  return {
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    setEncoding: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
  };
}

/**
 * Create a mock stdout stream for testing
 *
 * @param options - Configuration options
 * @param options.autoCallback - If true, automatically calls the write callback (default: true)
 */
export function createMockStdout(options: { autoCallback?: boolean } = {}): MockStdout {
  const { autoCallback = true } = options;

  return {
    write: jest.fn((_data: unknown, callback?: () => void) => {
      if (autoCallback && typeof callback === 'function') {
        callback();
      }
      return true;
    }),
    on: jest.fn(),
  };
}

/**
 * Mock Transport implementation for testing MCP servers
 *
 * Implements the Transport interface from @modelcontextprotocol/sdk
 * without requiring access to private properties.
 */
export class MockTransport implements Transport {
  public readonly mockStdin: MockStdin;
  public readonly mockStdout: MockStdout;

  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public onmessage?: <T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void;
  public sessionId?: string;

  public readonly start: jest.Mock<Promise<void>, []>;
  public readonly send: jest.Mock<Promise<void>, [JSONRPCMessage, TransportSendOptions?]>;
  public readonly close: jest.Mock<Promise<void>, []>;
  public readonly setProtocolVersion: jest.Mock<void, [string]>;

  private _started = false;

  constructor(options: { mockStdin?: MockStdin; mockStdout?: MockStdout } = {}) {
    this.mockStdin = options.mockStdin ?? createMockStdin();
    this.mockStdout = options.mockStdout ?? createMockStdout();

    this.start = jest.fn(async () => {
      this._started = true;
    });

    this.send = jest.fn(async (_message: JSONRPCMessage, _options?: TransportSendOptions) => {
      // Default implementation does nothing
    });

    this.close = jest.fn(async () => {
      this._started = false;
      if (this.onclose) {
        this.onclose();
      }
    });

    this.setProtocolVersion = jest.fn((_version: string) => {
      // Default implementation does nothing
    });
  }

  /**
   * Whether the transport has been started
   */
  get started(): boolean {
    return this._started;
  }

  /**
   * Simulate receiving a message from the client
   */
  simulateMessage<T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo): void {
    if (this.onmessage) {
      this.onmessage(message, extra);
    }
  }

  /**
   * Simulate an error occurring on the transport
   */
  simulateError(error: Error): void {
    if (this.onerror) {
      this.onerror(error);
    }
  }

  /**
   * Simulate the transport closing
   */
  simulateClose(): void {
    if (this.onclose) {
      this.onclose();
    }
  }

  /**
   * Reset all mock functions
   */
  resetMocks(): void {
    this.start.mockReset();
    this.send.mockReset();
    this.close.mockReset();
    this.setProtocolVersion.mockReset();
    this.mockStdin.on.mockReset();
    this.mockStdin.once.mockReset();
    this.mockStdin.removeListener.mockReset();
    this.mockStdin.setEncoding.mockReset();
    this.mockStdin.pause.mockReset();
    this.mockStdin.resume.mockReset();
    this.mockStdout.write.mockReset();
    this.mockStdout.on.mockReset();
    this._started = false;
  }
}

/**
 * Create a mock transport instance
 *
 * @example
 * ```typescript
 * const transport = createMockTransport();
 *
 * // Use with MCP Server
 * await server.connect(transport);
 *
 * // Verify interactions
 * expect(transport.start).toHaveBeenCalled();
 *
 * // Simulate incoming message
 * transport.simulateMessage({
 *   jsonrpc: '2.0',
 *   method: 'tools/list',
 *   id: 1
 * });
 * ```
 */
export function createMockTransport(
  options: { mockStdin?: MockStdin; mockStdout?: MockStdout } = {}
): MockTransport {
  return new MockTransport(options);
}

/**
 * Create real PassThrough streams for integration testing
 *
 * Use this when you need actual stream behavior rather than mocks
 *
 * @example
 * ```typescript
 * const { input, output } = createPassThroughStreams();
 *
 * // Write to input, read from output
 * input.write('{"jsonrpc":"2.0",...}\n');
 * output.on('data', (chunk) => console.log(chunk.toString()));
 * ```
 */
export function createPassThroughStreams(): {
  input: PassThrough;
  output: PassThrough;
} {
  return {
    input: new PassThrough(),
    output: new PassThrough(),
  };
}

/**
 * Helper to create a StdioServerTransport with mock streams
 *
 * This is a factory function for tests that need the actual StdioServerTransport
 * class but with controlled input/output streams.
 *
 * @example
 * ```typescript
 * import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
 *
 * const { transport, streams } = createStdioTransportWithMocks();
 * await server.connect(transport);
 *
 * // Simulate input
 * streams.input.write(JSON.stringify({ jsonrpc: '2.0', ... }) + '\n');
 * ```
 */
export function createStdioTransportWithMocks(): {
  transport: {
    new (input?: Readable, output?: Writable): Transport;
  } extends new (...args: infer P) => infer R
    ? R
    : Transport;
  streams: { input: PassThrough; output: PassThrough };
} {
  // Dynamic import to avoid circular dependencies and allow lazy loading
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js') as {
    StdioServerTransport: new (input?: Readable, output?: Writable) => Transport;
  };

  const streams = createPassThroughStreams();
  const transport = new StdioServerTransport(streams.input, streams.output);

  return { transport, streams };
}

/**
 * Helper to inject mock streams into an existing StdioServerTransport instance
 *
 * DEPRECATED: Prefer using createMockTransport() or createStdioTransportWithMocks()
 * instead. This function exists for backward compatibility during migration.
 *
 * @example
 * ```typescript
 * const transport = new StdioServerTransport();
 * const mocks = injectMockStreams(transport);
 *
 * await server.connect(transport);
 *
 * expect(mocks.stdin.setEncoding).toHaveBeenCalled();
 * ```
 */
export function injectMockStreams(transport: Transport): {
  stdin: MockStdin;
  stdout: MockStdout;
} {
  const stdin = createMockStdin();
  const stdout = createMockStdout();

  // Access private properties via type assertion
  // This is an acceptable use case during migration - prefer createMockTransport() for new tests
  const transportWithPrivates = transport as Transport & {
    _stdin?: unknown;
    _stdout?: unknown;
    input?: unknown;
    output?: unknown;
  };

  // Try both naming conventions (_stdin/_stdout and input/output)
  if ('_stdin' in transportWithPrivates) {
    transportWithPrivates._stdin = stdin;
    transportWithPrivates._stdout = stdout;
  }
  if ('input' in transportWithPrivates) {
    transportWithPrivates.input = stdin;
    transportWithPrivates.output = stdout;
  }

  return { stdin, stdout };
}
