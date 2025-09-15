import {
  loadConfig,
  getConfig,
  resetConfigCache,
  isProduction,
  isDevelopment,
  isTest,
  getMCPMode,
  getTeamCityConnectionOptions,
  getTeamCityRetryOptions,
  getTeamCityPaginationOptions,
  getTeamCityCircuitBreakerOptions,
  getTeamCityOptions,
  getTeamCityUrl,
  getTeamCityToken,
} from '@/config';

describe('config module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    resetConfigCache();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('loads default configuration with minimal environment', () => {
      process.env['NODE_ENV'] = 'development';
      const config = loadConfig();

      expect(config.server.port).toBe(3000);
      expect(config.server.nodeEnv).toBe('development');
      expect(config.server.logLevel).toBe('info');
      expect(config.server.mode).toBe('dev');
      expect(config.mcp.name).toBe('teamcity-mcp');
      expect(config.features.caching).toBe(false);
    });

    it('loads production configuration', () => {
      process.env['NODE_ENV'] = 'production';
      const config = loadConfig();

      expect(config.server.nodeEnv).toBe('production');
      expect(config.server.rateLimit.enabled).toBe(true);
      expect(config.features.caching).toBe(true);
    });

    it('loads custom port and log level', () => {
      process.env['PORT'] = '8080';
      process.env['LOG_LEVEL'] = 'debug';
      const config = loadConfig();

      expect(config.server.port).toBe(8080);
      expect(config.server.logLevel).toBe('debug');
    });

    it('loads TeamCity configuration from primary variables', () => {
      process.env['TEAMCITY_URL'] = 'https://teamcity.example.com';
      process.env['TEAMCITY_TOKEN'] = 'test-token-123';
      const config = loadConfig();

      expect(config.teamcity).toBeDefined();
      expect(config.teamcity?.url).toBe('https://teamcity.example.com');
      expect(config.teamcity?.token).toBe('test-token-123');
    });

    it('loads TeamCity configuration from alias variables', () => {
      process.env['TEAMCITY_SERVER_URL'] = 'https://tc.example.com';
      process.env['TEAMCITY_API_TOKEN'] = 'api-token-456';
      const config = loadConfig();

      expect(config.teamcity).toBeDefined();
      expect(config.teamcity?.url).toBe('https://tc.example.com');
      expect(config.teamcity?.token).toBe('api-token-456');
    });

    it('prefers primary variables over aliases', () => {
      process.env['TEAMCITY_URL'] = 'https://primary.example.com';
      process.env['TEAMCITY_SERVER_URL'] = 'https://alias.example.com';
      process.env['TEAMCITY_TOKEN'] = 'primary-token';
      process.env['TEAMCITY_API_TOKEN'] = 'alias-token';
      const config = loadConfig();

      expect(config.teamcity?.url).toBe('https://primary.example.com');
      expect(config.teamcity?.token).toBe('primary-token');
    });

    it('does not include TeamCity config when credentials are missing', () => {
      const config = loadConfig();
      expect(config.teamcity).toBeUndefined();
    });

    it('validates NODE_ENV values', () => {
      process.env['NODE_ENV'] = 'invalid';
      expect(() => loadConfig()).toThrow();
    });

    it('validates LOG_LEVEL values', () => {
      process.env['LOG_LEVEL'] = 'invalid';
      expect(() => loadConfig()).toThrow();
    });

    it('validates MCP_MODE values', () => {
      process.env['MCP_MODE'] = 'invalid';
      expect(() => loadConfig()).toThrow();
    });

    it('validates TEAMCITY_URL format', () => {
      process.env['TEAMCITY_URL'] = 'not-a-url';
      process.env['TEAMCITY_TOKEN'] = 'token';
      expect(() => loadConfig()).toThrow();
    });
  });

  describe('getConfig', () => {
    it('returns cached configuration on subsequent calls', () => {
      process.env['NODE_ENV'] = 'test';
      const config1 = getConfig();
      const config2 = getConfig();
      expect(config1).toBe(config2);
    });

    it('returns new configuration after cache reset', () => {
      process.env['NODE_ENV'] = 'test';
      const config1 = getConfig();
      resetConfigCache();
      const config2 = getConfig();
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('environment mode helpers', () => {
    it('isProduction returns true in production mode', () => {
      process.env['NODE_ENV'] = 'production';
      expect(isProduction()).toBe(true);
    });

    it('isProduction returns false in other modes', () => {
      process.env['NODE_ENV'] = 'development';
      expect(isProduction()).toBe(false);
    });

    it('isDevelopment returns true in development mode', () => {
      process.env['NODE_ENV'] = 'development';
      expect(isDevelopment()).toBe(true);
    });

    it('isDevelopment returns false in other modes', () => {
      process.env['NODE_ENV'] = 'test';
      expect(isDevelopment()).toBe(false);
    });

    it('isTest returns true in test mode', () => {
      process.env['NODE_ENV'] = 'test';
      expect(isTest()).toBe(true);
    });

    it('isTest returns false in other modes', () => {
      process.env['NODE_ENV'] = 'production';
      expect(isTest()).toBe(false);
    });
  });

  describe('getMCPMode', () => {
    it('returns dev mode by default', () => {
      delete process.env['MCP_MODE'];
      expect(getMCPMode()).toBe('dev');
    });

    it('returns dev mode when explicitly set', () => {
      process.env['MCP_MODE'] = 'dev';
      expect(getMCPMode()).toBe('dev');
    });

    it('returns full mode when set', () => {
      process.env['MCP_MODE'] = 'full';
      expect(getMCPMode()).toBe('full');
    });
  });

  describe('getTeamCityConnectionOptions', () => {
    it('returns default connection options', () => {
      const options = getTeamCityConnectionOptions();
      expect(options.timeout).toBe(30000);
      expect(options.maxConcurrentRequests).toBe(10);
      expect(options.keepAlive).toBe(true);
      expect(options.compression).toBe(true);
    });

    it('uses custom connection options from environment', () => {
      process.env['TEAMCITY_TIMEOUT'] = '60000';
      process.env['TEAMCITY_MAX_CONCURRENT'] = '20';
      process.env['TEAMCITY_KEEP_ALIVE'] = 'false';
      process.env['TEAMCITY_COMPRESSION'] = 'false';

      const options = getTeamCityConnectionOptions();
      expect(options.timeout).toBe(60000);
      expect(options.maxConcurrentRequests).toBe(20);
      expect(options.keepAlive).toBe(false);
      expect(options.compression).toBe(false);
    });
  });

  describe('getTeamCityRetryOptions', () => {
    it('returns default retry options', () => {
      const options = getTeamCityRetryOptions();
      expect(options.enabled).toBe(true);
      expect(options.maxRetries).toBe(3);
      expect(options.baseDelay).toBe(1000);
      expect(options.maxDelay).toBe(30000);
    });

    it('uses custom retry options from environment', () => {
      process.env['TEAMCITY_RETRY_ENABLED'] = 'false';
      process.env['TEAMCITY_MAX_RETRIES'] = '5';
      process.env['TEAMCITY_RETRY_DELAY'] = '2000';
      process.env['TEAMCITY_MAX_RETRY_DELAY'] = '60000';

      const options = getTeamCityRetryOptions();
      expect(options.enabled).toBe(false);
      expect(options.maxRetries).toBe(5);
      expect(options.baseDelay).toBe(2000);
      expect(options.maxDelay).toBe(60000);
    });
  });

  describe('getTeamCityPaginationOptions', () => {
    it('returns default pagination options', () => {
      const options = getTeamCityPaginationOptions();
      expect(options.defaultPageSize).toBe(100);
      expect(options.maxPageSize).toBe(1000);
      expect(options.autoFetchAll).toBe(false);
    });

    it('uses custom pagination options from environment', () => {
      process.env['TEAMCITY_PAGE_SIZE'] = '50';
      process.env['TEAMCITY_MAX_PAGE_SIZE'] = '500';
      process.env['TEAMCITY_AUTO_FETCH_ALL'] = 'true';

      const options = getTeamCityPaginationOptions();
      expect(options.defaultPageSize).toBe(50);
      expect(options.maxPageSize).toBe(500);
      expect(options.autoFetchAll).toBe(true);
    });
  });

  describe('getTeamCityCircuitBreakerOptions', () => {
    it('returns default circuit breaker options', () => {
      const options = getTeamCityCircuitBreakerOptions();
      expect(options.enabled).toBe(true);
      expect(options.failureThreshold).toBe(5);
      expect(options.resetTimeout).toBe(60000);
      expect(options.successThreshold).toBe(2);
    });

    it('uses custom circuit breaker options from environment', () => {
      process.env['TEAMCITY_CIRCUIT_BREAKER'] = 'false';
      process.env['TEAMCITY_CB_FAILURE_THRESHOLD'] = '10';
      process.env['TEAMCITY_CB_RESET_TIMEOUT'] = '120000';
      process.env['TEAMCITY_CB_SUCCESS_THRESHOLD'] = '3';

      const options = getTeamCityCircuitBreakerOptions();
      expect(options.enabled).toBe(false);
      expect(options.failureThreshold).toBe(10);
      expect(options.resetTimeout).toBe(120000);
      expect(options.successThreshold).toBe(3);
    });
  });

  describe('getTeamCityOptions', () => {
    it('returns all TeamCity option groups', () => {
      const options = getTeamCityOptions();

      expect(options.connection).toBeDefined();
      expect(options.retry).toBeDefined();
      expect(options.pagination).toBeDefined();
      expect(options.circuitBreaker).toBeDefined();

      expect(options.connection.timeout).toBe(30000);
      expect(options.retry.maxRetries).toBe(3);
      expect(options.pagination.defaultPageSize).toBe(100);
      expect(options.circuitBreaker.failureThreshold).toBe(5);
    });
  });

  describe('getTeamCityUrl', () => {
    it('returns TeamCity URL when configured', () => {
      process.env['TEAMCITY_URL'] = 'https://teamcity.example.com';
      process.env['TEAMCITY_TOKEN'] = 'token';
      resetConfigCache();

      expect(getTeamCityUrl()).toBe('https://teamcity.example.com');
    });

    it('returns test URL in test mode when not configured', () => {
      process.env['NODE_ENV'] = 'test';
      delete process.env['TEAMCITY_URL'];
      delete process.env['TEAMCITY_SERVER_URL'];
      resetConfigCache();

      expect(getTeamCityUrl()).toBe('https://teamcity.example.com');
    });

    it('throws error when not configured outside test mode', () => {
      process.env['NODE_ENV'] = 'development';
      delete process.env['TEAMCITY_URL'];
      delete process.env['TEAMCITY_SERVER_URL'];
      resetConfigCache();

      expect(() => getTeamCityUrl()).toThrow('TeamCity URL not configured');
    });
  });

  describe('getTeamCityToken', () => {
    it('returns TeamCity token when configured', () => {
      process.env['TEAMCITY_URL'] = 'https://teamcity.example.com';
      process.env['TEAMCITY_TOKEN'] = 'secret-token';
      resetConfigCache();

      expect(getTeamCityToken()).toBe('secret-token');
    });

    it('returns test token in test mode when not configured', () => {
      process.env['NODE_ENV'] = 'test';
      delete process.env['TEAMCITY_TOKEN'];
      delete process.env['TEAMCITY_API_TOKEN'];
      resetConfigCache();

      expect(getTeamCityToken()).toBe('test-token');
    });

    it('throws error when not configured outside test mode', () => {
      process.env['NODE_ENV'] = 'development';
      delete process.env['TEAMCITY_TOKEN'];
      delete process.env['TEAMCITY_API_TOKEN'];
      resetConfigCache();

      expect(() => getTeamCityToken()).toThrow('TeamCity token not configured');
    });
  });

  describe('boolean flag parsing', () => {
    it('treats "false" string as false', () => {
      process.env['TEAMCITY_KEEP_ALIVE'] = 'false';
      const options = getTeamCityConnectionOptions();
      expect(options.keepAlive).toBe(false);
    });

    it('treats "true" string as true', () => {
      process.env['TEAMCITY_KEEP_ALIVE'] = 'true';
      const options = getTeamCityConnectionOptions();
      expect(options.keepAlive).toBe(true);
    });

    it('treats other values as default', () => {
      process.env['TEAMCITY_KEEP_ALIVE'] = 'yes';
      const options = getTeamCityConnectionOptions();
      expect(options.keepAlive).toBe(true); // default value
    });

    it('treats undefined as default', () => {
      delete process.env['TEAMCITY_KEEP_ALIVE'];
      const options = getTeamCityConnectionOptions();
      expect(options.keepAlive).toBe(true); // default value
    });
  });
});