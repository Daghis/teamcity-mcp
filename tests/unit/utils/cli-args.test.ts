import * as fs from 'fs';

import { type CliArgs, getHelpText, getVersion, parseCliArgs } from '@/utils/cli-args';

// Mock fs for getVersion tests
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}));

const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

describe('parseCliArgs', () => {
  describe('boolean flags', () => {
    it('should parse --help flag', () => {
      const result = parseCliArgs(['--help']);
      expect(result.help).toBe(true);
      expect(result.version).toBe(false);
    });

    it('should parse -h flag', () => {
      const result = parseCliArgs(['-h']);
      expect(result.help).toBe(true);
    });

    it('should parse --version flag', () => {
      const result = parseCliArgs(['--version']);
      expect(result.version).toBe(true);
      expect(result.help).toBe(false);
    });

    it('should parse -v flag', () => {
      const result = parseCliArgs(['-v']);
      expect(result.version).toBe(true);
    });

    it('should handle both --help and --version', () => {
      const result = parseCliArgs(['--help', '--version']);
      expect(result.help).toBe(true);
      expect(result.version).toBe(true);
    });
  });

  describe('--key=value format', () => {
    it('should parse --url=value', () => {
      const result = parseCliArgs(['--url=https://example.com']);
      expect(result.url).toBe('https://example.com');
    });

    it('should parse --token=value', () => {
      const result = parseCliArgs(['--token=my-secret-token']);
      expect(result.token).toBe('my-secret-token');
    });

    it('should parse --mode=dev', () => {
      const result = parseCliArgs(['--mode=dev']);
      expect(result.mode).toBe('dev');
    });

    it('should parse --mode=full', () => {
      const result = parseCliArgs(['--mode=full']);
      expect(result.mode).toBe('full');
    });

    it('should warn and ignore invalid --mode value', () => {
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const result = parseCliArgs(['--mode=invalid']);
      expect(result.mode).toBeUndefined();
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid mode 'invalid'"));
      stderrSpy.mockRestore();
    });

    it('should parse --config=value', () => {
      const result = parseCliArgs(['--config=/path/to/config.env']);
      expect(result.config).toBe('/path/to/config.env');
    });

    it('should handle values with special characters', () => {
      const result = parseCliArgs(['--url=https://tc.example.com:8443/path?query=1']);
      expect(result.url).toBe('https://tc.example.com:8443/path?query=1');
    });
  });

  describe('--key value format', () => {
    it('should parse --url value', () => {
      const result = parseCliArgs(['--url', 'https://example.com']);
      expect(result.url).toBe('https://example.com');
    });

    it('should parse --token value', () => {
      const result = parseCliArgs(['--token', 'my-secret-token']);
      expect(result.token).toBe('my-secret-token');
    });

    it('should parse --mode dev', () => {
      const result = parseCliArgs(['--mode', 'dev']);
      expect(result.mode).toBe('dev');
    });

    it('should parse --mode full', () => {
      const result = parseCliArgs(['--mode', 'full']);
      expect(result.mode).toBe('full');
    });

    it('should warn and ignore invalid --mode value', () => {
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const result = parseCliArgs(['--mode', 'invalid']);
      expect(result.mode).toBeUndefined();
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid mode 'invalid'"));
      stderrSpy.mockRestore();
    });

    it('should parse --config value', () => {
      const result = parseCliArgs(['--config', '/path/to/config.env']);
      expect(result.config).toBe('/path/to/config.env');
    });
  });

  describe('mixed formats and multiple args', () => {
    it('should parse multiple args with mixed formats', () => {
      const result = parseCliArgs([
        '--url=https://tc.example.com',
        '--token',
        'my-token',
        '--mode=dev',
      ]);
      expect(result.url).toBe('https://tc.example.com');
      expect(result.token).toBe('my-token');
      expect(result.mode).toBe('dev');
    });

    it('should parse all supported args', () => {
      const result = parseCliArgs([
        '--url',
        'https://tc.example.com',
        '--token',
        'token123',
        '--mode',
        'full',
        '--config',
        '/path/config.env',
        '--help',
        '--version',
      ]);
      expect(result.url).toBe('https://tc.example.com');
      expect(result.token).toBe('token123');
      expect(result.mode).toBe('full');
      expect(result.config).toBe('/path/config.env');
      expect(result.help).toBe(true);
      expect(result.version).toBe(true);
    });

    it('should handle args in any order', () => {
      const result = parseCliArgs(['--mode', 'dev', '--url', 'https://example.com']);
      expect(result.url).toBe('https://example.com');
      expect(result.mode).toBe('dev');
    });
  });

  describe('edge cases', () => {
    it('should return defaults for empty args', () => {
      const result = parseCliArgs([]);
      expect(result).toEqual<CliArgs>({
        help: false,
        version: false,
      });
    });

    it('should ignore unknown flags', () => {
      const result = parseCliArgs(['--unknown', '--foo=bar', '-x']);
      expect(result.help).toBe(false);
      expect(result.version).toBe(false);
      expect(result.url).toBeUndefined();
    });

    it('should not consume value starting with dash', () => {
      // If --url is followed by something starting with -, it's not the value
      const result = parseCliArgs(['--url', '--token', 'abc']);
      expect(result.url).toBeUndefined();
      expect(result.token).toBe('abc');
    });

    it('should handle --key without value at end of args', () => {
      const result = parseCliArgs(['--url']);
      expect(result.url).toBeUndefined();
    });

    it('should handle empty string values in equals format', () => {
      const result = parseCliArgs(['--url=']);
      expect(result.url).toBe('');
    });

    it('should handle values containing equals sign', () => {
      const result = parseCliArgs(['--url=https://example.com?foo=bar']);
      expect(result.url).toBe('https://example.com?foo=bar');
    });
  });
});

describe('getVersion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return a version string when package.json exists', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '1.2.3' }));
    const version = getVersion();
    expect(typeof version).toBe('string');
    expect(version).toBe('1.2.3');
  });

  it('should return a semver-like version', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '1.2.3' }));
    const version = getVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('should try multiple paths and return first valid version', () => {
    // First path fails, second succeeds
    mockReadFileSync
      .mockImplementationOnce(() => {
        throw new Error('ENOENT');
      })
      .mockReturnValueOnce(JSON.stringify({ version: '2.0.0' }));

    const version = getVersion();
    expect(version).toBe('2.0.0');
    expect(mockReadFileSync).toHaveBeenCalledTimes(2);
  });

  it('should return unknown when package.json has no version field', () => {
    // Package.json exists but has no version
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'test-package' }));

    const version = getVersion();
    expect(version).toBe('unknown');
  });

  it('should return unknown when all paths fail', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });

    const version = getVersion();
    expect(version).toBe('unknown');
  });

  it('should return unknown when JSON parsing fails', () => {
    mockReadFileSync.mockReturnValue('not valid json');

    const version = getVersion();
    expect(version).toBe('unknown');
  });
});

describe('getHelpText', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock for getHelpText tests
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '1.0.0' }));
  });

  it('should return help text', () => {
    const help = getHelpText();
    expect(typeof help).toBe('string');
    expect(help.length).toBeGreaterThan(100);
  });

  it('should include usage information', () => {
    const help = getHelpText();
    expect(help).toContain('USAGE');
    expect(help).toContain('teamcity-mcp');
  });

  it('should document all CLI options', () => {
    const help = getHelpText();
    expect(help).toContain('--url');
    expect(help).toContain('--token');
    expect(help).toContain('--mode');
    expect(help).toContain('--config');
    expect(help).toContain('--help');
    expect(help).toContain('--version');
    expect(help).toContain('-h');
    expect(help).toContain('-v');
  });

  it('should include security warning about --token', () => {
    const help = getHelpText();
    expect(help).toContain('SECURITY WARNING');
    expect(help).toContain('--token');
    expect(help).toMatch(/process list|visible|history/i);
  });

  it('should include precedence information', () => {
    const help = getHelpText();
    expect(help).toContain('PRECEDENCE');
    expect(help).toContain('CLI arguments');
    expect(help).toContain('Config file');
    expect(help).toContain('Environment variables');
    expect(help).toContain('.env');
  });

  it('should include examples', () => {
    const help = getHelpText();
    expect(help).toContain('EXAMPLES');
    expect(help).toContain('--url https://');
  });

  it('should include config file format', () => {
    const help = getHelpText();
    expect(help).toContain('CONFIG FILE FORMAT');
    expect(help).toContain('TEAMCITY_URL=');
    expect(help).toContain('TEAMCITY_TOKEN=');
  });

  it('should include version in help text', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '2.5.0' }));
    const help = getHelpText();
    expect(help).toContain('v2.5.0');
  });
});
