/**
 * move_queued_build_to_top and reorder_queued_builds send the queue order to
 * PUT /app/rest/buildQueue/order. These tests run the real generated client
 * against a fake TeamCity that, like a real server, rejects a JSON body that is
 * declared as XML with HTTP 400.
 */
import axios, {
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

import { BuildQueueApi } from '@/teamcity-client/api/build-queue-api';
import { Configuration } from '@/teamcity-client/configuration';

jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://teamcity.example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'full',
}));

type QueueOrder = { build: Array<{ id: number }> };

const basePath = 'https://teamcity.example.test';

/** Accepts the queue order only when the declared content type matches the body. */
const fakeTeamCity = (received: QueueOrder[]): AxiosAdapter => {
  return async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const contentType = String(config.headers?.['Content-Type'] ?? '');
    const body = typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
    const respond = (status: number, data: unknown): AxiosResponse => ({
      status,
      statusText: status === 200 ? 'OK' : 'Bad Request',
      data,
      headers: {},
      config,
    });
    if (contentType.startsWith('application/json')) {
      const order = JSON.parse(body) as QueueOrder;
      received.push(order);
      return respond(200, order);
    }
    const error = new axios.AxiosError(
      'Request failed with status code 400',
      'ERR_BAD_REQUEST',
      config,
      undefined,
      respond(400, `Cannot parse ${contentType} body`)
    );
    throw error;
  };
};

const loadToolsWithFakeTeamCity = (received: QueueOrder[]) => {
  const http = axios.create({ baseURL: basePath, adapter: fakeTeamCity(received) });
  const buildQueue = new BuildQueueApi(new Configuration({ basePath }), basePath, http);
  jest.doMock('@/api-client', () => ({
    TeamCityAPI: { getInstance: () => ({ buildQueue }) },
  }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@/tools') as typeof import('@/tools');
};

const run = async (
  tool: string,
  args: Record<string, unknown>,
  received: QueueOrder[]
): Promise<{ isError: boolean; payload: Record<string, unknown> }> =>
  new Promise((resolve, reject) => {
    jest.isolateModules(() => {
      (async () => {
        const { getRequiredTool } = loadToolsWithFakeTeamCity(received);
        const res = await getRequiredTool(tool).handler(args);
        resolve({
          isError: res.success === false,
          payload: JSON.parse((res.content?.[0]?.text as string) ?? '{}'),
        });
      })().catch(reject);
    });
  });

describe('tools: queue order is accepted by TeamCity', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('move_queued_build_to_top moves the build to the top', async () => {
    const received: QueueOrder[] = [];
    const { isError, payload } = await run(
      'move_queued_build_to_top',
      { buildId: '123' },
      received
    );

    expect(isError).toBe(false);
    expect(payload).toMatchObject({ success: true, action: 'move_queued_build_to_top' });
    expect(received).toEqual([{ build: [{ id: 123 }] }]);
  });

  it('reorder_queued_builds applies the requested order', async () => {
    const received: QueueOrder[] = [];
    const { isError, payload } = await run(
      'reorder_queued_builds',
      { buildIds: ['7', '5', '9'] },
      received
    );

    expect(isError).toBe(false);
    expect(payload).toMatchObject({ success: true, action: 'reorder_queued_builds', count: 3 });
    expect(received).toEqual([{ build: [{ id: 7 }, { id: 5 }, { id: 9 }] }]);
  });
});
