import axios from 'axios';
import axiosRetry from 'axios-retry';

import { TeamCityAPI } from '@/api-client';
import * as config from '@/config';
import * as auth from '@/teamcity/auth';
import { TeamCityAPIError } from '@/teamcity/errors';

jest.mock('axios');
jest.mock('axios-retry');
jest.mock('@/config');
jest.mock('@/teamcity/auth');
jest.mock('@/utils/logger');

describe('TeamCityAPI', () => {
  const mockBaseUrl = 'https://teamcity.example.com';
  const mockToken = 'test-token-123';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Reset singleton instance
    (TeamCityAPI as any).instance = null;

    // Mock config functions
    (config.getTeamCityUrl as jest.Mock).mockReturnValue(mockBaseUrl);
    (config.getTeamCityToken as jest.Mock).mockReturnValue(mockToken);

    // Mock auth validation
    (auth.validateConfiguration as jest.Mock).mockReturnValue({
      isValid: true,
      errors: [],
    });

    // Mock axios.create
    const mockAxiosInstance = {
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
      defaults: {},
    };
    (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

    // Mock auth interceptors
    (auth.addRequestId as jest.Mock).mockImplementation((config) => config);
    (auth.logResponse as jest.Mock).mockImplementation((response) => response);
    (auth.logAndTransformError as jest.Mock).mockImplementation((error) => Promise.reject(error));
  });

  describe('getInstance', () => {
    it('creates a singleton instance', () => {
      const instance1 = TeamCityAPI.getInstance();
      const instance2 = TeamCityAPI.getInstance();

      expect(instance1).toBe(instance2);
      expect(axios.create).toHaveBeenCalledTimes(1);
    });

    it('creates axios instance with correct configuration', () => {
      TeamCityAPI.getInstance();

      expect(axios.create).toHaveBeenCalledWith({
        baseURL: mockBaseUrl,
        timeout: 30000,
        headers: {
          Authorization: `Bearer ${mockToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });
    });

    it('validates configuration before creating instance', () => {
      TeamCityAPI.getInstance();

      expect(auth.validateConfiguration).toHaveBeenCalledWith(mockBaseUrl, mockToken);
    });

    it('throws error if configuration is invalid', () => {
      (auth.validateConfiguration as jest.Mock).mockReturnValue({
        isValid: false,
        errors: ['Invalid URL', 'Invalid token'],
      });

      expect(() => TeamCityAPI.getInstance()).toThrow(
        'Invalid TeamCity configuration: Invalid URL, Invalid token'
      );
    });

    it('removes trailing slash from base URL', () => {
      (config.getTeamCityUrl as jest.Mock).mockReturnValue('https://teamcity.example.com/');

      TeamCityAPI.getInstance();

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://teamcity.example.com',
        })
      );
    });

    it('configures axios retry', () => {
      const mockAxiosInstance = {
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      };
      (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

      TeamCityAPI.getInstance();

      expect(axiosRetry).toHaveBeenCalledWith(
        mockAxiosInstance,
        expect.objectContaining({
          retries: 3,
          retryDelay: expect.any(Function),
          retryCondition: expect.any(Function),
        })
      );
    });

    it('attaches request and response interceptors', () => {
      const mockAxiosInstance = {
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      };
      (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

      TeamCityAPI.getInstance();

      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalledWith(
        expect.any(Function)
      );
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('initializes all API service instances', () => {
      const instance = TeamCityAPI.getInstance();

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
  });

  describe('testConnection', () => {
    it('tests connection successfully', async () => {
      const mockAxiosInstance = {
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      };
      (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

      const instance = TeamCityAPI.getInstance();
      // Mock the projects.getAllProjects method
      instance.projects.getAllProjects = jest.fn().mockResolvedValue({ projects: [] });

      const result = await instance.testConnection();

      expect(result).toBe(true);
      expect(instance.projects.getAllProjects).toHaveBeenCalled();
    });

    it('returns false on connection failure', async () => {
      const mockAxiosInstance = {
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      };
      (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

      const instance = TeamCityAPI.getInstance();
      // Mock the projects.getAllProjects method to fail
      instance.projects.getAllProjects = jest.fn().mockRejectedValue(new Error('Connection failed'));

      const result = await instance.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('retry configuration', () => {
    it('configures retry delay with exponential backoff', () => {
      const mockAxiosInstance = {
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      };
      (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

      TeamCityAPI.getInstance();

      const retryConfig = (axiosRetry as unknown as jest.Mock).mock.calls[0][1];
      const delay1 = retryConfig.retryDelay(1, { config: {} });
      const delay2 = retryConfig.retryDelay(2, { config: {} });
      const delay3 = retryConfig.retryDelay(3, { config: {} });

      expect(delay1).toBe(1000);
      expect(delay2).toBe(2000);
      expect(delay3).toBe(4000);
    });

    it('respects max delay limit', () => {
      const mockAxiosInstance = {
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      };
      (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

      TeamCityAPI.getInstance();

      const retryConfig = (axiosRetry as unknown as jest.Mock).mock.calls[0][1];
      const delay = retryConfig.retryDelay(10, { config: {} });

      expect(delay).toBeLessThanOrEqual(8000);
    });

    it('uses Retry-After header when available', () => {
      const mockAxiosInstance = {
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      };
      (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

      // Mock TeamCityAPIError.fromAxiosError to return error with retryAfter
      const mockError = new TeamCityAPIError('Rate limited', 'RATE_LIMITED', 429);
      (mockError as any).retryAfter = 5;
      jest.spyOn(TeamCityAPIError, 'fromAxiosError').mockReturnValue(mockError);

      TeamCityAPI.getInstance();

      const retryConfig = (axiosRetry as unknown as jest.Mock).mock.calls[0][1];
      const delay = retryConfig.retryDelay(1, { config: { requestId: 'test-id' } });

      expect(delay).toBe(5000); // 5 seconds converted to milliseconds
    });

    it('configures retry condition', () => {
      const mockAxiosInstance = {
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      };
      (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

      TeamCityAPI.getInstance();

      const retryConfig = (axiosRetry as unknown as jest.Mock).mock.calls[0][1];

      // Verify retry condition is a function
      expect(typeof retryConfig.retryCondition).toBe('function');

      // Verify the retry config has the expected structure
      expect(retryConfig).toHaveProperty('retries', 3);
      expect(typeof retryConfig.retryDelay).toBe('function');
    });
  });

  describe('API configuration', () => {
    it('creates configuration with correct access token', () => {
      const instance = TeamCityAPI.getInstance();
      const apiConfig = (instance as any).config;

      expect(apiConfig).toBeDefined();
      expect(apiConfig.accessToken).toBe(mockToken);
      expect(apiConfig.basePath).toBe(mockBaseUrl);
    });

    it('sets correct default headers in configuration', () => {
      const instance = TeamCityAPI.getInstance();
      const apiConfig = (instance as any).config;

      expect(apiConfig.baseOptions.headers).toEqual({
        Authorization: `Bearer ${mockToken}`,
        Accept: 'application/json',
      });
    });
  });
});