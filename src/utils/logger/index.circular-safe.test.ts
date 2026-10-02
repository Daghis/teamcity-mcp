import { inspect } from 'util';
import type { Logform, Logger } from 'winston';

import { type TeamCityLogger, createLogger, safeStringify } from './index';

/**
 * Regression test: log metadata can contain values with circular references
 * (e.g. an Axios streaming response whose body is a Node socket with
 * `_httpMessage -> ClientRequest -> Agent` back-references). The dev formatter
 * must never throw while serializing such metadata, because logging runs
 * synchronously inside Axios interceptors and a throw would abort the request.
 */
describe('TeamCityLogger circular-safe metadata', () => {
  const createCircular = (): Record<string, unknown> => {
    const circular: Record<string, unknown> = { host: 'ci.example.com' };
    circular['self'] = circular;
    return circular;
  };

  const formatForConsole = (logger: TeamCityLogger, info: Logform.TransformableInfo): string => {
    const [consoleTransport] = (logger as unknown as { winston: Logger }).winston.transports;
    const formatted = consoleTransport?.format?.transform(info);
    return typeof formatted === 'object' ? String(formatted[Symbol.for('message')]) : '';
  };

  it('serializes circular metadata without throwing', () => {
    const output = safeStringify({ socket: createCircular() });

    expect(output).toContain('ci.example.com');
    expect(output).toContain('[Circular *1]');
  });

  it('bounds long strings in metadata', () => {
    const output = safeStringify({ body: 'x'.repeat(5000) });

    expect(output.length).toBeLessThan(1200);
    expect(output).toContain('more characters');
  });

  it('falls back when a custom inspect hook throws', () => {
    const hostile = {
      [inspect.custom]: () => {
        throw new Error('boom');
      },
    };

    expect(safeStringify(hostile)).toBe('[Uninspectable value]');
  });

  it('formats circular metadata through the console transport', () => {
    const logger = createLogger({ enableConsole: true, enableFile: false, level: 'info' });

    expect(() =>
      logger.info('streaming response completed', { socket: createCircular() })
    ).not.toThrow();
    const output = formatForConsole(logger, {
      level: 'info',
      message: 'streaming response completed',
      service: 'teamcity-mcp',
      socket: createCircular(),
      [Symbol.for('level')]: 'info',
    });

    expect(output).toContain('streaming response completed');
    expect(output).toContain('[Circular *1]');
  });

  it('leaves winston internal symbol keys out of the formatted metadata', () => {
    const logger = createLogger({ enableConsole: true, enableFile: false, level: 'info' });
    const meta = { method: 'GET', url: '/downloadBuildLog.html' };

    // The shape winston builds for logger.info(message, meta).
    const output = formatForConsole(logger, {
      ...meta,
      level: 'info',
      message: 'Starting TeamCity API request',
      service: 'teamcity-mcp',
      [Symbol.for('level')]: 'info',
      [Symbol.for('splat')]: [meta],
    });

    expect(output).toContain("url: '/downloadBuildLog.html'");
    expect(output).not.toContain('Symbol(');
  });
});
