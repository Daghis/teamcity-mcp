import winston from 'winston';

// Import lazily after mocking winston in each test

describe('logger convenience wrapper', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('forwards calls and context to underlying logger', async () => {
    const mockChild = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as winston.Logger;

    const mockRoot = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockReturnValue(mockChild),
      level: 'info',
      end: jest.fn(),
    } as unknown as jest.Mocked<winston.Logger>;

    jest.spyOn(winston, 'createLogger').mockReturnValue(mockRoot);
    const { logger } = await import('./index');

    const ctx = { a: 1 } as const;
    logger.debug('d', ctx);
    logger.info('i');
    logger.warn('w');
    logger.error('e', new Error('x'));
    expect(mockRoot.debug).toHaveBeenCalledWith('d', ctx);
    expect(mockRoot.info).toHaveBeenCalledWith('i', {});
    expect(mockRoot.warn).toHaveBeenCalledWith('w', {});
    expect(mockRoot.error).toHaveBeenCalledWith('e', expect.objectContaining({ error: 'x' }));

    // child logger inherits context
    const child = logger.child({ svc: 'x' });
    child.info('child-msg', { z: 9 });
    expect(mockRoot.child).toHaveBeenCalledWith({ svc: 'x' });
    expect(mockChild.info).toHaveBeenCalledWith('child-msg', { z: 9 });

    // request + tool helpers route to appropriate levels
    logger.logTeamCityRequest('GET', '/x', 200, 1, { id: '1' });
    expect(mockRoot.debug).toHaveBeenCalledWith('TeamCity API request: GET /x', {
      id: '1',
      method: 'GET',
      url: '/x',
      status: 200,
      duration: 1,
    });
    logger.logTeamCityRequest('POST', '/y', 500, 10);
    expect(mockRoot.warn).toHaveBeenCalledWith('TeamCity API request failed: POST /y', {
      method: 'POST',
      url: '/y',
      status: 500,
      duration: 10,
    });

    logger.logToolExecution('t', { p: 1 }, { success: true }, 2, { id: '2' });
    expect(mockRoot.info).toHaveBeenCalledWith('Tool executed successfully: t', {
      id: '2',
      toolName: 't',
      duration: 2,
      args: JSON.stringify({ p: 1 }),
      success: true,
    });

    logger.logLifecycle('start', { port: 3 });
    expect(mockRoot.info).toHaveBeenCalledWith('Server lifecycle: start', {
      lifecycle: 'start',
      port: 3,
    });
  });
});
