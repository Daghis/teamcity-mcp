import { TeamCityAPI, TeamCityAPIClientConfig } from '@/api-client';
import type { Build } from '@/teamcity-client/models/build';
import type { Changes } from '@/teamcity-client/models/changes';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

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
