/**
 * Tests for TeamCity API Client
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import axios from 'axios';

import { TeamCityAPI } from '@/api-client';
import * as config from '@/config';

jest.mock('axios');
jest.mock('@/config');
jest.mock('@/utils/logger');

describe('TeamCityAPI', () => {
  const mockBaseUrl = 'https://teamcity.test.com';
  const mockToken = 'test-token-123';

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton instance
    (TeamCityAPI as any).instance = null;
    
    // Mock config functions
    (config.getTeamCityUrl as jest.Mock).mockReturnValue(mockBaseUrl);
    (config.getTeamCityToken as jest.Mock).mockReturnValue(mockToken);

    // Mock axios.create to return a mock axios instance
    const mockAxiosInstance = {
      interceptors: {
        request: {
          use: jest.fn(),
        },
        response: {
          use: jest.fn(),
        },
      },
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    };
    (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should create singleton instance with config values', () => {
      const instance1 = TeamCityAPI.getInstance();
      const instance2 = TeamCityAPI.getInstance();

      expect(instance1).toBe(instance2);
      expect(config.getTeamCityUrl).toHaveBeenCalled();
      expect(config.getTeamCityToken).toHaveBeenCalled();
    });

    it('should create new instance when baseUrl and token provided', () => {
      const customUrl = 'https://custom.teamcity.com';
      const customToken = 'custom-token';

      const instance = TeamCityAPI.getInstance(customUrl, customToken);

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: customUrl,
          timeout: 30000,
          headers: expect.objectContaining({
            Authorization: `Bearer ${customToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should remove trailing slash from base URL', () => {
      const urlWithSlash = 'https://teamcity.test.com/';
      const urlWithoutSlash = 'https://teamcity.test.com';

      TeamCityAPI.getInstance(urlWithSlash, mockToken);

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: urlWithoutSlash,
        })
      );
    });

    it('should throw error for invalid configuration', () => {
      // Invalid URL
      expect(() => TeamCityAPI.getInstance('not-a-url', mockToken)).toThrow(
        'Invalid TeamCity configuration'
      );

      // Empty token
      expect(() => TeamCityAPI.getInstance(mockBaseUrl, '')).toThrow(
        'Invalid TeamCity configuration'
      );
    });

    it('should initialize all API clients', () => {
      const instance = TeamCityAPI.getInstance(mockBaseUrl, mockToken);

      expect(instance.builds).toBeDefined();
      expect(instance.projects).toBeDefined();
      expect(instance.buildTypes).toBeDefined();
      expect(instance.buildQueue).toBeDefined();
      expect(instance.tests).toBeDefined();
      expect(instance.vcsRoots).toBeDefined();
      expect(instance.agents).toBeDefined();
      expect(instance.agentPools).toBeDefined();
      expect(instance.server).toBeDefined();
      expect(instance.health).toBeDefined();
    });

    it('should configure axios interceptors', () => {
      const mockAxiosInstance = {
        interceptors: {
          request: {
            use: jest.fn(),
          },
          response: {
            use: jest.fn(),
          },
        },
      };
      (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

      TeamCityAPI.getInstance(mockBaseUrl, mockToken);

      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('testConnection', () => {
    it('should return true when connection is successful', async () => {
      const instance = TeamCityAPI.getInstance(mockBaseUrl, mockToken);
      
      // Mock successful API call
      instance.projects.getAllProjects = jest.fn().mockResolvedValue({ data: [] });

      const result = await instance.testConnection();

      expect(result).toBe(true);
      expect(instance.projects.getAllProjects).toHaveBeenCalledWith(
        undefined,
        '$long,project($short)'
      );
    });

    it('should return false when connection fails', async () => {
      const instance = TeamCityAPI.getInstance(mockBaseUrl, mockToken);
      
      // Mock failed API call
      instance.projects.getAllProjects = jest.fn().mockRejectedValue(new Error('Connection failed'));

      const result = await instance.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('axios configuration', () => {
    it('should configure retry with axios-retry', () => {
      // Import axios-retry to check if it's called
      const axiosRetry = require('axios-retry');
      jest.spyOn(axiosRetry, 'default');

      TeamCityAPI.getInstance(mockBaseUrl, mockToken);

      expect(axiosRetry.default).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          retries: 3,
          retryDelay: expect.any(Function),
          retryCondition: expect.any(Function),
        })
      );
    });

    it('should set correct default headers', () => {
      TeamCityAPI.getInstance(mockBaseUrl, mockToken);

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${mockToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should set correct timeout', () => {
      TeamCityAPI.getInstance(mockBaseUrl, mockToken);

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
        })
      );
    });
  });

  describe('API client initialization', () => {
    it('should pass configuration to all API clients', () => {
      const BuildApi = require('@/teamcity-client/api/build-api').BuildApi;
      const ProjectApi = require('@/teamcity-client/api/project-api').ProjectApi;
      
      jest.spyOn(BuildApi.prototype, 'constructor' as any);
      jest.spyOn(ProjectApi.prototype, 'constructor' as any);

      const instance = TeamCityAPI.getInstance(mockBaseUrl, mockToken);

      // Verify that API clients are created with correct configuration
      expect(instance.builds).toBeInstanceOf(BuildApi);
      expect(instance.projects).toBeInstanceOf(ProjectApi);
    });

    it('should reuse axios instance for all API clients', () => {
      const mockAxiosInstance = {
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      };
      (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

      const instance = TeamCityAPI.getInstance(mockBaseUrl, mockToken);

      // The same axios instance should be passed to all API clients
      // This is verified by checking that axios.create is called only once
      expect(axios.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should validate configuration before creating instance', () => {
      // Test with various invalid configurations
      const invalidConfigs = [
        { url: '', token: 'valid-token' },
        { url: 'https://valid.url', token: '' },
        { url: 'not-a-url', token: 'valid-token' },
        { url: 'ftp://wrong.protocol', token: 'valid-token' },
      ];

      invalidConfigs.forEach(({ url, token }) => {
        expect(() => TeamCityAPI.getInstance(url, token)).toThrow(
          'Invalid TeamCity configuration'
        );
      });
    });

    it('should handle missing configuration gracefully', () => {
      (config.getTeamCityUrl as jest.Mock).mockImplementation(() => {
        throw new Error('TeamCity URL not configured');
      });

      expect(() => TeamCityAPI.getInstance()).toThrow('TeamCity URL not configured');
    });
  });

  describe('retry configuration', () => {
    it('should configure exponential backoff for retries', () => {
      const axiosRetry = require('axios-retry');
      let retryDelayFn: Function;

      jest.spyOn(axiosRetry, 'default').mockImplementation((instance, options) => {
        retryDelayFn = options.retryDelay;
      });

      TeamCityAPI.getInstance(mockBaseUrl, mockToken);

      // Test exponential backoff calculation
      const mockError = { config: { requestId: 'test-123' } };
      
      // @ts-ignore - Testing internal function
      expect(retryDelayFn(1, mockError)).toBeLessThanOrEqual(1000);
      // @ts-ignore - Testing internal function
      expect(retryDelayFn(2, mockError)).toBeLessThanOrEqual(2000);
      // @ts-ignore - Testing internal function
      expect(retryDelayFn(3, mockError)).toBeLessThanOrEqual(4000);
      // @ts-ignore - Testing internal function
      expect(retryDelayFn(4, mockError)).toBeLessThanOrEqual(8000);
    });

    it('should check if error is retryable', () => {
      const axiosRetry = require('axios-retry');
      let retryConditionFn: Function;

      jest.spyOn(axiosRetry, 'default').mockImplementation((instance, options) => {
        retryConditionFn = options.retryCondition;
      });

      TeamCityAPI.getInstance(mockBaseUrl, mockToken);

      // The retry condition should be a function
      expect(typeof retryConditionFn).toBe('function');
    });
  });
});