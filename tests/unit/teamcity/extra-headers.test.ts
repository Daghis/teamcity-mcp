import { TeamCityAPI, type TeamCityAPIClientConfig } from '@/api-client';
import { getTeamCityExtraHeaders, resetConfigCache } from '@/config';

const HEADER_PREFIX = 'TEAMCITY_HEADER_';

describe('getTeamCityExtraHeaders', () => {
  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith(HEADER_PREFIX)) {
        delete process.env[key];
      }
    }
    resetConfigCache();
  });

  it('returns undefined when no per-header env vars are set', () => {
    expect(getTeamCityExtraHeaders()).toBeUndefined();
  });

  it('uses the env-var suffix verbatim as the header name', () => {
    process.env[`${HEADER_PREFIX}CF-Access-Client-Id`] = 'id-123';
    process.env[`${HEADER_PREFIX}CF-Access-Client-Secret`] = 'secret-456';
    process.env[`${HEADER_PREFIX}X_Underscore_Header`] = 'literal-underscore';

    expect(getTeamCityExtraHeaders()).toEqual({
      'CF-Access-Client-Id': 'id-123',
      'CF-Access-Client-Secret': 'secret-456',
      X_Underscore_Header: 'literal-underscore',
    });
  });

  it('ignores per-header env vars with empty header names', () => {
    process.env[`${HEADER_PREFIX}`] = 'orphan';
    expect(getTeamCityExtraHeaders()).toBeUndefined();
  });
});

describe('TeamCityAPI extra headers', () => {
  const baseConfig: TeamCityAPIClientConfig = {
    baseUrl: 'https://teamcity.example.com',
    token: 'test-token',
    timeout: 1234,
  };

  beforeEach(() => {
    TeamCityAPI.reset();
  });

  afterEach(() => {
    TeamCityAPI.reset();
  });

  it('attaches extra headers as axios defaults', () => {
    const api = TeamCityAPI.getInstance({
      ...baseConfig,
      extraHeaders: {
        'CF-Access-Client-Id': 'id-123',
        'CF-Access-Client-Secret': 'secret-456',
      },
    });

    const headers = api.http.defaults.headers as unknown as Record<string, unknown>;
    expect(headers['CF-Access-Client-Id']).toBe('id-123');
    expect(headers['CF-Access-Client-Secret']).toBe('secret-456');
    // Canonical headers are still present and not clobbered.
    expect(headers['Authorization']).toBe('Bearer test-token');
  });

  it('does not let extra headers override the auth header', () => {
    const api = TeamCityAPI.getInstance({
      ...baseConfig,
      extraHeaders: {
        Authorization: 'Bearer attacker-token',
      },
    });

    const headers = api.http.defaults.headers as unknown as Record<string, unknown>;
    expect(headers['Authorization']).toBe('Bearer test-token');
  });

  it('reuses the singleton when extra headers are unchanged', () => {
    const extraHeaders = { 'CF-Access-Client-Id': 'id' };
    const first = TeamCityAPI.getInstance({ ...baseConfig, extraHeaders });
    const second = TeamCityAPI.getInstance({
      ...baseConfig,
      extraHeaders: { ...extraHeaders },
    });

    expect(second).toBe(first);
  });

  it('rebuilds the singleton when extra headers change', () => {
    const first = TeamCityAPI.getInstance({
      ...baseConfig,
      extraHeaders: { 'CF-Access-Client-Id': 'id-1' },
    });
    const second = TeamCityAPI.getInstance({
      ...baseConfig,
      extraHeaders: { 'CF-Access-Client-Id': 'id-2' },
    });

    expect(second).not.toBe(first);
  });

  it('treats undefined and empty extra-header maps as equivalent', () => {
    const first = TeamCityAPI.getInstance(baseConfig);
    const second = TeamCityAPI.getInstance({ ...baseConfig, extraHeaders: {} });

    expect(second).toBe(first);
  });
});
