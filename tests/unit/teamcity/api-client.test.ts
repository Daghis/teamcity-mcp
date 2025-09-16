import { TeamCityAPI, type TeamCityAPIClientConfig } from '@/api-client';
import { AgentTypeApi } from '@/teamcity-client/api/agent-type-api';
import { TestApi } from '@/teamcity-client/api/test-api';

const BASE_CONFIG: TeamCityAPIClientConfig = {
  baseUrl: 'https://teamcity.example.com',
  token: 'test-token',
};

describe('TeamCityAPI surface', () => {
  beforeEach(() => {
    TeamCityAPI.reset();
  });

  afterEach(() => {
    TeamCityAPI.reset();
  });

  it('wires newly exposed API modules and shares the axios instance', () => {
    const api = TeamCityAPI.getInstance(BASE_CONFIG);

    expect(api.agentTypes).toBeInstanceOf(AgentTypeApi);
    expect(api.testMetadata).toBeInstanceOf(TestApi);
    expect(api.tests).toBe(api.testOccurrences);
    expect(api.http.defaults.baseURL).toBe(BASE_CONFIG.baseUrl);
    expect(api.modules.tests).toBe(api.tests);
    expect(api.modules.testMetadata).toBe(api.testMetadata);
    expect(api.modules.buildTypes).toBe(api.buildTypes);
    expect(Object.isFrozen(api.modules)).toBe(true);
  });

  it('continues to support the legacy positional overrides', () => {
    const api = TeamCityAPI.getInstance('https://legacy.example.com/', 'legacy-token');

    expect(api.getBaseUrl()).toBe('https://legacy.example.com');
    expect(api.http.defaults.baseURL).toBe('https://legacy.example.com');
  });
});
