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

    // Winston's Console transport writes through the global `console`, targeting
    // `console._stderr`/`console._stdout` when present and falling back to
    // `console.error`/`console.log` otherwise. Under Jest, `console._stderr`
    // is not guaranteed to be the same object as `process.stderr` (it depends
    // on how earlier tests in the same worker touched those streams), so spying
    // only on `process.stderr.write` can miss the output entirely. Capture every
    // sink Winston might use so the assertion is independent of that identity.
    const captured: string[] = [];
    const spies: Array<() => void> = [];

    const spyWrite = (stream: { write?: unknown } | undefined): void => {
      if (!stream || typeof stream.write !== 'function') return;
      const target = stream as { write: (...args: unknown[]) => boolean };
      const original = target.write.bind(target);
      target.write = (...args: unknown[]): boolean => {
        captured.push(String(args[0]));
        return original(...args);
      };
      spies.push(() => {
        target.write = original as typeof target.write;
      });
    };

    const spyMethod = (name: 'log' | 'info' | 'warn' | 'error'): void => {
      const original = console[name];
      const target = console as unknown as Record<string, (...args: unknown[]) => void>;
      target[name] = (...args: unknown[]): void => {
        captured.push(args.map((a) => String(a)).join(' '));
      };
      spies.push(() => {
        target[name] = original as (...args: unknown[]) => void;
      });
    };

    const consoleStreams = console as unknown as Record<string, { write?: unknown } | undefined>;
    spyWrite(process.stderr);
    spyWrite(process.stdout);
    spyWrite(consoleStreams['_stderr']);
    spyWrite(consoleStreams['_stdout']);
    spyMethod('log');
    spyMethod('info');
    spyMethod('warn');
    spyMethod('error');

    try {
      expect(() => logger.info('streaming response completed', { socket: circular })).not.toThrow();

      const output = captured.join('');
      expect(output).toContain('streaming response completed');
      expect(output).toContain('Circular');
    } finally {
      for (const restore of spies) restore();
    }
  });
});
