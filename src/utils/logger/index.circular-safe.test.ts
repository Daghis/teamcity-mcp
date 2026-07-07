import { createLogger } from './index';

/**
 * Regression test: log metadata can contain values with circular references
 * (e.g. an Axios streaming response whose body is a Node socket with
 * `_httpMessage -> ClientRequest -> Agent` back-references). The dev formatter
 * must never throw while serializing such metadata, because logging runs
 * synchronously inside Axios interceptors and a throw would abort the request.
 */
describe('TeamCityLogger circular-safe metadata', () => {
  it('does not throw when metadata contains circular references', () => {
    const logger = createLogger({ enableConsole: true, enableFile: false, level: 'info' });

    const circular: Record<string, unknown> = { host: 'ci.example.com' };
    circular['self'] = circular;

    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      expect(() => logger.info('streaming response completed', { socket: circular })).not.toThrow();

      const output = [...stderrSpy.mock.calls, ...stdoutSpy.mock.calls]
        .map((call) => String(call[0]))
        .join('');
      expect(output).toContain('streaming response completed');
      expect(output).toContain('Circular');
    } finally {
      stderrSpy.mockRestore();
      stdoutSpy.mockRestore();
    }
  });
});
