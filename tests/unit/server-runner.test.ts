import { startServerLifecycle } from '@/server-runner';

class MockTransport {
  public started = false;
  public closed = false;

  async start(): Promise<void> {
    this.started = true;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

class MockServer {
  public connectCalls = 0;
  public closeCalls = 0;
  public onclose?: () => void;
  public onerror?: (error: unknown) => void;

  async connect(_transport: MockTransport): Promise<void> {
    this.connectCalls += 1;
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
  }

  triggerClose(): void {
    this.onclose?.();
  }

  triggerError(error: unknown): void {
    this.onerror?.(error);
  }
}

const flushPromises = async () => new Promise(process.nextTick);

describe('startServerLifecycle', () => {
  it('waits for server close before resolving', async () => {
    const server = new MockServer();
    const transport = new MockTransport();
    const lifecycle = startServerLifecycle(server as never, transport as never);

    await flushPromises();

    let resolved = false;
    void lifecycle.then(() => {
      resolved = true;
    });

    await flushPromises();
    expect(resolved).toBe(false);

    server.triggerClose();

    await expect(lifecycle).resolves.toBeUndefined();
    expect(resolved).toBe(true);
  });

  it('rejects when the server reports an error and closes the transport', async () => {
    const server = new MockServer();
    const transport = new MockTransport();
    const lifecycle = startServerLifecycle(server as never, transport as never);

    await flushPromises();

    const error = new Error('boom');
    server.triggerError(error);

    await expect(lifecycle).rejects.toThrow(error);
    expect(transport.closed).toBe(true);
  });
});
