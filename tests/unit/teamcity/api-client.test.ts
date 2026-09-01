import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import { TeamCityAPI, TeamCityAPIClientConfig } from '@/api-client';
import type { Build } from '@/teamcity-client/models/build';
import type { Changes } from '@/teamcity-client/models/changes';

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

  it('downloads the build log from the documented .html endpoint', async () => {
    const api = TeamCityAPI.getInstance(baseConfig);
    const getSpy = jest
      .spyOn(api.http, 'get')
      .mockResolvedValue(createAxiosResponse<string>('log contents'));

    const response = await api.downloadBuildLog('123', { responseType: 'stream' });

    expect(getSpy).toHaveBeenCalledTimes(1);
    const [url, config] = getSpy.mock.calls[0] as [string, { params?: Record<string, unknown> }];
    expect(url).toBe('/downloadBuildLog.html');
    expect(config?.params).toMatchObject({ buildId: '123' });
    expect(response.data).toBe('log contents');
  });

  it('falls back to the REST log endpoint when .html fails', async () => {
    const api = TeamCityAPI.getInstance(baseConfig);
    const getSpy = jest
      .spyOn(api.http, 'get')
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce(createAxiosResponse<string>('fallback log'));

    const response = await api.downloadBuildLog('123');

    expect(getSpy).toHaveBeenCalledTimes(2);
    expect(getSpy.mock.calls[0]?.[0]).toBe('/downloadBuildLog.html');
    const [fallbackUrl, fallbackConfig] = getSpy.mock.calls[1] as [
      string,
      { params?: Record<string, unknown> },
    ];
    expect(fallbackUrl).toBe('/app/rest/builds/id:123/log');
    expect(fallbackConfig?.params).toMatchObject({ plain: true });
    expect(response.data).toBe('fallback log');
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
