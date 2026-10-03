import { AxiosError, AxiosHeaders } from 'axios';
import { inspect } from 'util';
import type { Logform, Logger } from 'winston';

import { TeamCityAPIError, TeamCityAuthenticationError } from '@/teamcity/errors';

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

  const createOriginalError = (): AxiosError => {
    const original = new AxiosError('Request failed', 'ERR_BAD_RESPONSE', {
      headers: new AxiosHeaders({ authorization: 'Bearer SAMPLE_HEADER_SECRET' }),
    });
    original.request = { _header: 'Authorization: Bearer SAMPLE_REQUEST_SECRET' };
    return original;
  };

  const createApiError = (): TeamCityAPIError =>
    new TeamCityAPIError(
      'Not found',
      'HTTP_404',
      404,
      { buildId: '123' },
      'safe-request',
      createOriginalError()
    );

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

  const errorContainers: Array<[string, (error: TeamCityAPIError) => unknown]> = [
    ['root', (error) => error],
    ['nested object', (error) => ({ result: { error } })],
    ['array', (error) => [error]],
    ['Map', (error) => new Map([[error, error]])],
    ['Set', (error) => new Set([error])],
    ['shared references', (error) => ({ first: error, second: error })],
  ];

  it.each(errorContainers)('keeps request credentials out of %s error metadata', (_name, wrap) => {
    const output = safeStringify(wrap(createApiError()));

    expect(output).toContain('HTTP_404');
    expect(output).toContain('safe-request');
    expect(output).not.toContain('originalError');
    expect(output).not.toContain('SAMPLE_HEADER_SECRET');
    expect(output).not.toContain('SAMPLE_REQUEST_SECRET');
  });

  it('uses the safe error representation for subclasses and circular details', () => {
    const error = new TeamCityAuthenticationError(
      'Unauthorized',
      'safe-request',
      createOriginalError()
    );
    const output = safeStringify({ error, other: createCircular() });

    expect(output).toContain('TeamCityAuthenticationError');
    expect(output).toContain('AUTHENTICATION_ERROR');
    expect(output).toContain('[Circular *1]');
    expect(output).not.toContain('SAMPLE_HEADER_SECRET');
    expect(output).not.toContain('SAMPLE_REQUEST_SECRET');

    const circularError = new TeamCityAPIError(
      'Failed',
      'HTTP_500',
      500,
      createCircular(),
      undefined,
      createOriginalError()
    );
    expect(safeStringify({ error: circularError })).toContain('[Circular *1]');
    expect(safeStringify({ error: circularError })).not.toContain('SAMPLE_HEADER_SECRET');
  });

  it('preserves ordinary shared references without marking them as circular', () => {
    const shared = { buildId: '123' };
    const output = safeStringify({ first: shared, second: shared });

    expect(output.match(/buildId: '123'/g)).toHaveLength(2);
    expect(output).not.toContain('[Circular');
  });

  it('keeps request credentials out of the development console formatter', () => {
    const logger = createLogger({ enableConsole: true, enableFile: false, level: 'error' });
    const output = formatForConsole(logger, {
      level: 'error',
      message: 'API request failed',
      service: 'teamcity-mcp',
      error: createApiError(),
      [Symbol.for('level')]: 'error',
    });

    expect(output).toContain('HTTP_404');
    expect(output).toContain('safe-request');
    expect(output).not.toContain('SAMPLE_HEADER_SECRET');
    expect(output).not.toContain('SAMPLE_REQUEST_SECRET');
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
