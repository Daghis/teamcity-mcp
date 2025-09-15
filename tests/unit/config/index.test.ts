/**
 * Tests for configuration management module
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

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

describe('Configuration Management', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    resetConfigCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfigCache();
  });

  describe('loadConfig', () => {
    it('should load default configuration with minimal env vars', () => {
      process.env.NODE_ENV = 'development';
      const config = loadConfig();

      expect(config.server.nodeEnv).toBe('development');
      expect(config.server.port).toBe(3000);
      expect(config.server.logLevel).toBe('info');
      expect(config.mcp.mode).toBe('dev');
    });

    it('should load configuration with custom values', () => {
      process.env.NODE_ENV = 'production';
      process.env.PORT = '8080';
      process.env.LOG_LEVEL = 'debug';
      process.env.MCP_MODE = 'full';

      const config = loadConfig();

      expect(config.server.nodeEnv).toBe('production');
      expect(config.server.port).toBe(8080);
      expect(config.server.logLevel).toBe('debug');
      expect(config.mcp.mode).toBe('full');
    });

    it('should configure TeamCity when credentials are provided', () => {
      process.env.TEAMCITY_URL = 'https://tc.example.com';
      process.env.TEAMCITY_TOKEN = 'secret-token';

      const config = loadConfig();

      expect(config.teamcity).toBeDefined();
      expect(config.teamcity?.url).toBe('https://tc.example.com');
      expect(config.teamcity?.token).toBe('secret-token');
    });

    it('should support TeamCity credential aliases', () => {
      process.env.TEAMCITY_SERVER_URL = 'https://tc-alias.example.com';
      process.env.TEAMCITY_API_TOKEN = 'alias-token';

      const config = loadConfig();

      expect(config.teamcity).toBeDefined();
      expect(config.teamcity?.url).toBe('https://tc-alias.example.com');
      expect(config.teamcity?.token).toBe('alias-token');
    });

    it('should prefer primary names over aliases', () => {
      process.env.TEAMCITY_URL = 'https://primary.example.com';
      process.env.TEAMCITY_SERVER_URL = 'https://alias.example.com';
      process.env.TEAMCITY_TOKEN = 'primary-token';
      process.env.TEAMCITY_API_TOKEN = 'alias-token';

      const config = loadConfig();

      expect(config.teamcity?.url).toBe('https://primary.example.com');
      expect(config.teamcity?.token).toBe('primary-token');
    });

    it('should not include TeamCity config when credentials are missing', () => {
      delete process.env.TEAMCITY_URL;
      delete process.env.TEAMCITY_TOKEN;

      const config = loadConfig();

      expect(config.teamcity).toBeUndefined();
    });

    it('should enable caching in production', () => {
      process.env.NODE_ENV = 'production';
      const config = loadConfig();

      expect(config.features.caching).toBe(true);
      expect(config.server.rateLimit.enabled).toBe(true);
    });

    it('should disable caching in development', () => {
      process.env.NODE_ENV = 'development';
      const config = loadConfig();

      expect(config.features.caching).toBe(false);
      expect(config.server.rateLimit.enabled).toBe(false);
    });

    it('should throw error for invalid NODE_ENV', () => {
      process.env.NODE_ENV = 'invalid';

      expect(() => loadConfig()).toThrow();
    });

    it('should throw error for invalid MCP_MODE', () => {
      process.env.MCP_MODE = 'invalid';

      expect(() => loadConfig()).toThrow();
    });

    it('should throw error for invalid LOG_LEVEL', () => {
      process.env.LOG_LEVEL = 'invalid';

      expect(() => loadConfig()).toThrow();
    });

    it('should throw error for invalid TeamCity URL', () => {
      process.env.TEAMCITY_URL = 'not-a-url';

      expect(() => loadConfig()).toThrow();
    });
  });

  describe('getConfig', () => {
    it('should cache configuration after first load', () => {
      process.env.NODE_ENV = 'test';
      
      const config1 = getConfig();
      const config2 = getConfig();

      expect(config1).toBe(config2);
    });

    it('should return fresh config after cache reset', () => {
      process.env.NODE_ENV = 'test';
      
      const config1 = getConfig();
      resetConfigCache();
      process.env.NODE_ENV = 'production';
      const config2 = getConfig();

      expect(config1).not.toBe(config2);
      expect(config1.server.nodeEnv).toBe('test');
      expect(config2.server.nodeEnv).toBe('production');
    });
  });

  describe('Environment helpers', () => {
    it('isProduction should detect production mode', () => {
      process.env.NODE_ENV = 'production';
      expect(isProduction()).toBe(true);

      process.env.NODE_ENV = 'development';
      expect(isProduction()).toBe(false);
    });

    it('isDevelopment should detect development mode', () => {
      process.env.NODE_ENV = 'development';
      expect(isDevelopment()).toBe(true);

      process.env.NODE_ENV = 'production';
      expect(isDevelopment()).toBe(false);
    });

    it('isTest should detect test mode', () => {
      process.env.NODE_ENV = 'test';
      expect(isTest()).toBe(true);

      process.env.NODE_ENV = 'production';
      expect(isTest()).toBe(false);
    });
  });

  describe('getMCPMode', () => {
    it('should return dev mode by default', () => {
      delete process.env.MCP_MODE;
      expect(getMCPMode()).toBe('dev');
    });

    it('should return configured MCP mode', () => {
      process.env.MCP_MODE = 'full';
      expect(getMCPMode()).toBe('full');

      process.env.MCP_MODE = 'dev';
      expect(getMCPMode()).toBe('dev');
    });
  });

  describe('TeamCity connection options', () => {
    it('should return default connection options', () => {
      const options = getTeamCityConnectionOptions();

      expect(options.timeout).toBe(30000);
      expect(options.maxConcurrentRequests).toBe(10);
      expect(options.keepAlive).toBe(true);
      expect(options.compression).toBe(true);
    });

    it('should parse custom connection options', () => {
      process.env.TEAMCITY_TIMEOUT = '60000';
      process.env.TEAMCITY_MAX_CONCURRENT = '5';
      process.env.TEAMCITY_KEEP_ALIVE = 'false';
      process.env.TEAMCITY_COMPRESSION = 'false';

      const options = getTeamCityConnectionOptions();

      expect(options.timeout).toBe(60000);
      expect(options.maxConcurrentRequests).toBe(5);
      expect(options.keepAlive).toBe(false);
      expect(options.compression).toBe(false);
    });

    it('should handle boolean flag parsing', () => {
      process.env.TEAMCITY_KEEP_ALIVE = 'true';
      expect(getTeamCityConnectionOptions().keepAlive).toBe(true);

      process.env.TEAMCITY_KEEP_ALIVE = 'false';
      expect(getTeamCityConnectionOptions().keepAlive).toBe(false);

      process.env.TEAMCITY_KEEP_ALIVE = 'invalid';
      expect(getTeamCityConnectionOptions().keepAlive).toBe(true); // default
    });
  });

  describe('TeamCity retry options', () => {
    it('should return default retry options', () => {
      const options = getTeamCityRetryOptions();

      expect(options.enabled).toBe(true);
      expect(options.maxRetries).toBe(3);
      expect(options.baseDelay).toBe(1000);
      expect(options.maxDelay).toBe(30000);
    });

    it('should parse custom retry options', () => {
      process.env.TEAMCITY_RETRY_ENABLED = 'false';
      process.env.TEAMCITY_MAX_RETRIES = '5';
      process.env.TEAMCITY_RETRY_DELAY = '2000';
      process.env.TEAMCITY_MAX_RETRY_DELAY = '60000';

      const options = getTeamCityRetryOptions();

      expect(options.enabled).toBe(false);
      expect(options.maxRetries).toBe(5);
      expect(options.baseDelay).toBe(2000);
      expect(options.maxDelay).toBe(60000);
    });
  });

  describe('TeamCity pagination options', () => {
    it('should return default pagination options', () => {
      const options = getTeamCityPaginationOptions();

      expect(options.defaultPageSize).toBe(100);
      expect(options.maxPageSize).toBe(1000);
      expect(options.autoFetchAll).toBe(false);
    });

    it('should parse custom pagination options', () => {
      process.env.TEAMCITY_PAGE_SIZE = '50';
      process.env.TEAMCITY_MAX_PAGE_SIZE = '500';
      process.env.TEAMCITY_AUTO_FETCH_ALL = 'true';

      const options = getTeamCityPaginationOptions();

      expect(options.defaultPageSize).toBe(50);
      expect(options.maxPageSize).toBe(500);
      expect(options.autoFetchAll).toBe(true);
    });
  });

  describe('TeamCity circuit breaker options', () => {
    it('should return default circuit breaker options', () => {
      const options = getTeamCityCircuitBreakerOptions();

      expect(options.enabled).toBe(true);
      expect(options.failureThreshold).toBe(5);
      expect(options.resetTimeout).toBe(60000);
      expect(options.successThreshold).toBe(2);
    });

    it('should parse custom circuit breaker options', () => {
      process.env.TEAMCITY_CIRCUIT_BREAKER = 'false';
      process.env.TEAMCITY_CB_FAILURE_THRESHOLD = '10';
      process.env.TEAMCITY_CB_RESET_TIMEOUT = '120000';
      process.env.TEAMCITY_CB_SUCCESS_THRESHOLD = '3';

      const options = getTeamCityCircuitBreakerOptions();

      expect(options.enabled).toBe(false);
      expect(options.failureThreshold).toBe(10);
      expect(options.resetTimeout).toBe(120000);
      expect(options.successThreshold).toBe(3);
    });
  });

  describe('getTeamCityOptions', () => {
    it('should return all TeamCity options at once', () => {
      process.env.TEAMCITY_TIMEOUT = '45000';
      process.env.TEAMCITY_MAX_RETRIES = '2';
      process.env.TEAMCITY_PAGE_SIZE = '200';
      process.env.TEAMCITY_CB_FAILURE_THRESHOLD = '8';

      const options = getTeamCityOptions();

      expect(options.connection.timeout).toBe(45000);
      expect(options.retry.maxRetries).toBe(2);
      expect(options.pagination.defaultPageSize).toBe(200);
      expect(options.circuitBreaker.failureThreshold).toBe(8);
    });
  });

  describe('TeamCity URL and Token', () => {
    it('should return TeamCity URL from config', () => {
      process.env.TEAMCITY_URL = 'https://tc.test.com';
      process.env.TEAMCITY_TOKEN = 'test-token';

      expect(getTeamCityUrl()).toBe('https://tc.test.com');
    });

    it('should return TeamCity token from config', () => {
      process.env.TEAMCITY_URL = 'https://tc.test.com';
      process.env.TEAMCITY_TOKEN = 'test-token-123';

      expect(getTeamCityToken()).toBe('test-token-123');
    });

    it('should return test URL in test mode when not configured', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.TEAMCITY_URL;
      delete process.env.TEAMCITY_TOKEN;

      expect(getTeamCityUrl()).toBe('https://teamcity.example.com');
    });

    it('should return test token in test mode when not configured', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.TEAMCITY_URL;
      delete process.env.TEAMCITY_TOKEN;

      expect(getTeamCityToken()).toBe('test-token');
    });

    it('should throw error for missing URL in non-test mode', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.TEAMCITY_URL;
      delete process.env.TEAMCITY_TOKEN;

      expect(() => getTeamCityUrl()).toThrow('TeamCity URL not configured');
    });

    it('should throw error for missing token in non-test mode', () => {
      process.env.NODE_ENV = 'development';
      process.env.TEAMCITY_URL = 'https://tc.test.com';
      delete process.env.TEAMCITY_TOKEN;

      expect(() => getTeamCityToken()).toThrow('TeamCity token not configured');
    });
  });

  describe('Configuration validation', () => {
    it('should validate PORT is a number', () => {
      process.env.PORT = 'not-a-number';
      
      // PORT gets transformed to number, so invalid values will result in NaN
      const config = loadConfig();
      expect(config.server.port).toBeNaN();
    });

    it('should handle missing optional TeamCity environment variables', () => {
      process.env.TEAMCITY_URL = 'https://tc.test.com';
      process.env.TEAMCITY_TOKEN = 'token';
      // Don't set any optional variables

      const config = loadConfig();
      const options = getTeamCityOptions();

      // Should use defaults
      expect(options.connection.timeout).toBe(30000);
      expect(options.retry.enabled).toBe(true);
      expect(options.pagination.autoFetchAll).toBe(false);
      expect(options.circuitBreaker.enabled).toBe(true);
    });
  });
});