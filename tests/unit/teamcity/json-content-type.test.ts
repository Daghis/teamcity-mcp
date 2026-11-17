import { Readable } from 'node:stream';

import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import { TeamCityAPI, type TeamCityAPIClientConfig } from '@/api-client';

const baseConfig: TeamCityAPIClientConfig = {
  baseUrl: 'https://teamcity.example.com',
  token: 'test-token',
  timeout: 1000,
};

interface CapturedRequest {
  contentType: string | undefined;
  data: unknown;
}

/**
 * Replaces the transport on the shared axios instance so tests see exactly what would go over
 * the wire (after axios has serialized the body) without making a network call.
 */
function captureRequests(api: TeamCityAPI): CapturedRequest[] {
  const captured: CapturedRequest[] = [];
  api.http.defaults.adapter = async (
    config: InternalAxiosRequestConfig
  ): Promise<AxiosResponse<unknown>> => {
    const contentType = config.headers.getContentType();
    captured.push({
      contentType: typeof contentType === 'string' ? contentType : undefined,
      data: config.data,
    });
    return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
  };
  return captured;
}

describe('TeamCityAPI request Content-Type', () => {
  beforeEach(() => {
    TeamCityAPI.reset();
  });

  afterEach(() => {
    TeamCityAPI.reset();
  });

  // Each of these generated methods hard-codes `Content-Type: application/xml` while axios
  // serializes the object body as JSON. TeamCity rejects that mismatch with a 400.
  const xmlLabelledCalls: Array<[string, object, (api: TeamCityAPI, body: object) => unknown]> = [
    [
      'agents.setAgentPool',
      { id: 2 },
      (api, body) => api.agents.setAgentPool('id:1', undefined, body),
    ],
    [
      'buildQueue.setQueuedBuildsOrder',
      { build: [{ id: 7 }] },
      (api, body) => api.buildQueue.setQueuedBuildsOrder(undefined, body),
    ],
    [
      'buildTypes.createBuildType',
      { id: 'Proj_Build', name: 'Build' },
      (api, body) => api.buildTypes.createBuildType(undefined, body),
    ],
    [
      'vcsRoots.addVcsRoot',
      { id: 'Proj_Repo', name: 'Repo' },
      (api, body) => api.vcsRoots.addVcsRoot(undefined, body),
    ],
  ];

  it.each(xmlLabelledCalls)(
    'labels the JSON body of %s as application/json',
    async (_, body, call) => {
      const api = TeamCityAPI.getInstance(baseConfig);
      const captured = captureRequests(api);

      await call(api, body);

      expect(captured).toEqual([{ contentType: 'application/json', data: JSON.stringify(body) }]);
    }
  );

  it('keeps application/xml for a body that is already an XML string', async () => {
    const api = TeamCityAPI.getInstance(baseConfig);
    const captured = captureRequests(api);
    const xml = '<agent-requirement type="exists"/>';

    await api.http.post('/app/rest/buildTypes/id:Bt/agent-requirements', xml, {
      headers: { 'Content-Type': 'application/xml' },
    });

    expect(captured).toEqual([{ contentType: 'application/xml', data: xml }]);
  });

  it('relabels an object body declared as XML with a charset parameter', async () => {
    const api = TeamCityAPI.getInstance(baseConfig);
    const captured = captureRequests(api);

    await api.http.put(
      '/app/rest/agents/id:1/pool',
      { id: 2 },
      {
        headers: { 'Content-Type': 'application/xml; charset=UTF-8' },
      }
    );

    expect(captured).toEqual([{ contentType: 'application/json', data: '{"id":2}' }]);
  });

  it('relabels a class-instance body that axios serializes as JSON', async () => {
    class PoolRef {
      constructor(readonly id: number) {}
    }
    const api = TeamCityAPI.getInstance(baseConfig);
    const captured = captureRequests(api);

    await api.agents.setAgentPool('id:1', undefined, new PoolRef(2));

    expect(captured).toEqual([{ contentType: 'application/json', data: '{"id":2}' }]);
  });

  it('keeps application/xml for a stream body', async () => {
    const api = TeamCityAPI.getInstance(baseConfig);
    const captured = captureRequests(api);
    const xml = Readable.from(['<agent-requirement type="exists"/>']);

    await api.http.post('/app/rest/buildTypes/id:Bt/agent-requirements', xml, {
      headers: { 'Content-Type': 'application/xml' },
    });

    expect(captured).toEqual([{ contentType: 'application/xml', data: xml }]);
  });

  it('keeps application/xml for a binary body', async () => {
    const api = TeamCityAPI.getInstance(baseConfig);
    const captured = captureRequests(api);
    const xml = Buffer.from('<agent-requirement type="exists"/>');

    await api.http.post('/app/rest/buildTypes/id:Bt/agent-requirements', xml, {
      headers: { 'Content-Type': 'application/xml' },
    });

    expect(captured).toEqual([{ contentType: 'application/xml', data: xml }]);
  });

  it('keeps an explicit application/json override on an XML-labelled method', async () => {
    const api = TeamCityAPI.getInstance(baseConfig);
    const captured = captureRequests(api);

    await api.agents.setAgentPool(
      'id:1',
      undefined,
      { id: 2 },
      { headers: { 'Content-Type': 'application/json' } }
    );

    expect(captured).toEqual([{ contentType: 'application/json', data: '{"id":2}' }]);
  });
});
