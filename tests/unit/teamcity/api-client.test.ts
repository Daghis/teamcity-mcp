import { type Server, createServer } from 'node:http';

import {
  AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { IAxiosRetryConfig } from 'axios-retry';

import { TeamCityAPI, TeamCityAPIClientConfig } from '@/api-client';
import type { Build } from '@/teamcity-client/models/build';
import type { Changes } from '@/teamcity-client/models/changes';
import { TeamCityAPIError } from '@/teamcity/errors';
import * as logger from '@/utils/logger';

const baseConfig: TeamCityAPIClientConfig = {
  baseUrl: 'https://teamcity.example.com',
  token: 'test-token',
  timeout: 4321,
};

const createAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
  config: { headers: {} } as InternalAxiosRequestConfig,
});

describe('TeamCityAPI unified surface', () => {
  beforeEach(() => {
    TeamCityAPI.reset();
  });

  afterEach(() => {
    TeamCityAPI.reset();
  });

  it('exposes a frozen modules map backed by shared instances', () => {
    const api = TeamCityAPI.getInstance(baseConfig);

    expect(Object.isFrozen(api.modules)).toBe(true);
    expect(api.modules.agentTypes).toBe(api.agentTypes);
    expect(api.modules.vcsRootInstances).toBe(api.vcsRootInstances);
    expect(api.modules.testMetadata).toBe(api.testMetadata);
  });

  it('surfaces the shared axios instance via http()', () => {
    const api = TeamCityAPI.getInstance(baseConfig);

    expect(api.http.defaults.baseURL).toBe('https://teamcity.example.com');
    expect(api.http.defaults.timeout).toBe(4321);
  });

  it('supports the legacy signature for backwards compatibility', () => {
    const api = TeamCityAPI.getInstance('https://another.example.com', 'legacy-token');

    expect(api.modules.tests).toBe(api.tests);
    expect(api.http.defaults.baseURL).toBe('https://another.example.com');
  });

  it('reuses the singleton when provided equivalent configuration', () => {
    const first = TeamCityAPI.getInstance(baseConfig);
    const second = TeamCityAPI.getInstance({ ...baseConfig, baseUrl: `${baseConfig.baseUrl}/` });

    expect(second).toBe(first);
  });

  it('creates a new instance when configuration changes', () => {
    const first = TeamCityAPI.getInstance(baseConfig);
    const second = TeamCityAPI.getInstance({ ...baseConfig, token: 'alternate-token' });

    expect(second).not.toBe(first);
  });

  it('routes listChangesForBuild through the generated ChangeApi', async () => {
    const api = TeamCityAPI.getInstance(baseConfig);
    const mockResponse = createAxiosResponse<Changes>({ change: [] });
    const getAllChangesSpy = jest
      .spyOn(api.changes, 'getAllChanges')
      .mockResolvedValue(mockResponse);

    const response = await api.listChangesForBuild('123', 'change($short)');

    expect(getAllChangesSpy).toHaveBeenCalledWith('build:(id:123)', 'change($short)');
    expect(response).toBe(mockResponse);
  });

  it('routes listSnapshotDependencies through the generated BuildApi and unwraps payload', async () => {
    const api = TeamCityAPI.getInstance(baseConfig);
    const dependencies = { build: [] };
    const buildPayload = { 'snapshot-dependencies': dependencies } as Build;
    const mockResponse = createAxiosResponse<Build>(buildPayload);
    const getBuildSpy = jest.spyOn(api.builds, 'getBuild').mockResolvedValue(mockResponse);

    const response = await api.listSnapshotDependencies('123');

    expect(getBuildSpy).toHaveBeenCalledWith('id:123', 'snapshot-dependencies');
    expect(response.data).toBe(dependencies);
  });
});

describe('TeamCityAPI when retries are exhausted', () => {
  // X-Request-ID of every attempt the server received (initial request + retries)
  const seenRequestIds: Array<string | string[] | undefined> = [];
  let server: Server;
  let baseUrl: string;
  let logError: jest.SpiedFunction<typeof logger.error>;

  beforeAll(async () => {
    server = createServer((req, res) => {
      seenRequestIds.push(req.headers['x-request-id']);
      res.writeHead(503, { 'Content-Type': 'application/json', Connection: 'close' });
      res.end(JSON.stringify({ message: 'Service Unavailable' }));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected the test server to listen on a TCP port');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    seenRequestIds.length = 0;
    TeamCityAPI.reset();
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    logError = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    TeamCityAPI.reset();
  });

  // Skip the backoff waits; the retry count and retry condition stay as configured.
  // Declared with an explicit type because ts-jest doesn't see axios-retry's
  // augmentation of AxiosRequestConfig.
  const skipBackoff: AxiosRequestConfig & { 'axios-retry': IAxiosRetryConfig } = {
    'axios-retry': { retryDelay: () => 0 },
  };

  const requestUntilRetriesExhausted = async (): Promise<unknown> => {
    const api = TeamCityAPI.getInstance({ baseUrl, token: 'test-token' });
    try {
      await api.http.get('/app/rest/server', skipBackoff);
    } catch (error) {
      return error;
    }
    throw new Error('Expected the request to fail');
  };

  it('rejects with the TeamCityAPIError from the final attempt', async () => {
    const error = await requestUntilRetriesExhausted();

    expect(seenRequestIds).toHaveLength(4);
    const finalRequestId = seenRequestIds[3];
    expect(typeof finalRequestId).toBe('string');
    expect(error).toBeInstanceOf(TeamCityAPIError);
    expect(error).toMatchObject({
      code: 'HTTP_503',
      statusCode: 503,
      message: 'Service Unavailable',
      requestId: finalRequestId,
      originalError: expect.any(AxiosError),
    });
  });

  it('logs the failure once', async () => {
    await requestUntilRetriesExhausted();

    expect(seenRequestIds).toHaveLength(4);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      'TeamCity API request failed',
      undefined,
      expect.objectContaining({ code: 'HTTP_503', statusCode: 503 })
    );
  });
});
