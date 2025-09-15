import { logger } from './index';

describe('logger convenience wrapper', () => {
  it('exposes wrapper methods that call through without throwing', () => {
    // The underlying singleton is already mocked in other tests via winston.createLogger
    // Here we just smoke test the wrappers to ensure they are callable
    expect(() => logger.debug('d', { a: 1 })).not.toThrow();
    expect(() => logger.info('i')).not.toThrow();
    expect(() => logger.warn('w')).not.toThrow();
    expect(() => logger.error('e', new Error('x'))).not.toThrow();
    expect(() => logger.child({ svc: 'x' })).not.toThrow();
    expect(() => logger.logTeamCityRequest('GET', '/x', 200, 1, { id: '1' })).not.toThrow();
    expect(() =>
      logger.logToolExecution('t', { p: 1 }, { success: true }, 2, { id: '2' })
    ).not.toThrow();
    expect(() => logger.logLifecycle('start', { port: 3 })).not.toThrow();
  });
});
