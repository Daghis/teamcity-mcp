import { type TeamCityFullConfig, toApiClientConfig, toClientConfig } from '@/teamcity/config';

describe('teamcity config helpers', () => {
  const fullConfig: TeamCityFullConfig = {
    connection: {
      baseUrl: 'https://teamcity.example.com',
      token: 'token-123',
      timeout: 5000,
      maxConcurrentRequests: 5,
      keepAlive: true,
      compression: true,
    },
    retry: {
      enabled: true,
      maxRetries: 4,
      baseDelay: 250,
      maxDelay: 5000,
      retryableStatuses: [500],
    },
  };

  it('converts to TeamCityAPI client config', () => {
    expect(toApiClientConfig(fullConfig)).toEqual({
      baseUrl: 'https://teamcity.example.com',
      token: 'token-123',
      timeout: 5000,
    });
  });

  it('retains legacy TeamCityClientConfig structure', () => {
    expect(toClientConfig(fullConfig)).toEqual({
      baseUrl: 'https://teamcity.example.com',
      token: 'token-123',
      timeout: 5000,
      retryConfig: {
        retries: 4,
        retryDelay: 250,
      },
    });
  });
});
