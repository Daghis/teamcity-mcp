import winston from 'winston';

import { TeamCityLogger } from './index';

describe('TeamCityLogger file transports', () => {
  let mockLogger: jest.Mocked<winston.Logger>;
  let capturedOptions: Array<Record<string, unknown>>;

  beforeEach(() => {
    capturedOptions = [];
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn(),
      level: 'info',
      end: jest.fn(),
    } as unknown as jest.Mocked<winston.Logger>;

    jest
      .spyOn(winston, 'createLogger')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation((opts: any) => {
        capturedOptions.push(opts as Record<string, unknown>);
        return mockLogger;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('adds file transports when enableFile=true and parses file size units', () => {
    // m => MB, k => KB, invalid => fallback
    new TeamCityLogger({ enableConsole: false, enableFile: true, maxFileSize: '5m' });
    new TeamCityLogger({ enableConsole: false, enableFile: true, maxFileSize: '128k' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new TeamCityLogger({ enableConsole: false, enableFile: true, maxFileSize: 'invalid' as any });

    expect(capturedOptions.length).toBe(3);
    for (const opts of capturedOptions) {
      const o = opts as Record<string, unknown>;
      const transports = Array.isArray(o['transports']) ? (o['transports'] as unknown[]) : [];
      // Expect two file transports to be present
      const files = transports.filter((t) => (t as { filename?: string }).filename);
      expect(files.length).toBe(2);
      const names = files.map((t) => (t as { filename?: string }).filename);
      expect(names?.some((n) => n?.endsWith('error.log'))).toBe(true);
      expect(names?.some((n) => n?.endsWith('combined.log'))).toBe(true);
    }
  });
});
