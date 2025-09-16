import { TeamCityAPI, TeamCityAPIClientConfig } from '@/api-client';

const baseConfig: TeamCityAPIClientConfig = {
  baseUrl: 'https://teamcity.example.com',
  token: 'test-token',
  timeout: 4321,
};

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
});
