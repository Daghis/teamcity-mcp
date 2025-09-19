import { BuildResultsManager } from '@/teamcity/build-results-manager';
import type { TeamCityUnifiedClient } from '@/teamcity/types/client';

const BASE_URL = 'https://teamcity.example.com';

type StubbedModules = {
  builds: {
    getBuild: jest.Mock;
    getFilesListOfBuild: jest.Mock;
    getBuildStatisticValues: jest.Mock;
  };
  changes: {
    getAllChanges: jest.Mock;
  };
};

type StubbedClient = {
  client: TeamCityUnifiedClient;
  modules: StubbedModules;
  http: { get: jest.Mock };
  request: jest.Mock;
};

const createStubClient = (): StubbedClient => {
  const modules: StubbedModules = {
    builds: {
      getBuild: jest.fn(),
      getFilesListOfBuild: jest.fn(),
      getBuildStatisticValues: jest.fn(),
    },
    changes: {
      getAllChanges: jest.fn(),
    },
  };

  const http = {
    get: jest.fn(),
  } as { get: jest.Mock };

  const request = jest.fn(
    async (fn: (ctx: { axios: typeof http; baseUrl: string }) => Promise<unknown>) =>
      fn({ axios: http, baseUrl: BASE_URL })
  ) as jest.Mock;

  const client = {
    modules: modules as unknown as TeamCityUnifiedClient['modules'],
    http: http as unknown as TeamCityUnifiedClient['http'],
    request: request as unknown as TeamCityUnifiedClient['request'],
    getConfig: jest.fn(() => ({ connection: { baseUrl: BASE_URL, token: 'token' } })),
    getApiConfig: jest.fn(() => ({ baseUrl: BASE_URL, token: 'token' })),
    getAxios: jest.fn(() => http as unknown as TeamCityUnifiedClient['http']),
  } as TeamCityUnifiedClient;

  return { client, modules, http, request };
};

describe('BuildResultsManager', () => {
  const basicBuildPayload = () => ({
    id: 12345,
    buildTypeId: 'MyBuildConfig',
    number: '42',
    status: 'SUCCESS',
    state: 'finished',
    statusText: 'Build completed',
    webUrl: `${BASE_URL}/viewLog.html?buildId=12345`,
  });

  let manager: BuildResultsManager;
  let stub: StubbedClient;
  let managerInternals: {
    fetchArtifacts: (buildId: string, options: Record<string, unknown>) => Promise<unknown>;
    fetchStatistics: (buildId: string) => Promise<Record<string, unknown>>;
    fetchChanges: (buildId: string) => Promise<unknown[]>;
    fetchDependencies: (buildId: string) => Promise<unknown[]>;
  };

  beforeEach(() => {
    stub = createStubClient();
    stub.modules.builds.getBuild.mockResolvedValue({ data: basicBuildPayload() });

    manager = new BuildResultsManager(stub.client);
    type PrivateAccess = { cache: Map<string, unknown> };
    (manager as unknown as PrivateAccess).cache.clear();

    managerInternals = manager as unknown as typeof managerInternals;
  });

  describe('getBuildResults', () => {
    it('returns normalized build summary without optional data', async () => {
      const result = await manager.getBuildResults('12345');

      expect(stub.modules.builds.getBuild).toHaveBeenCalledWith('id:12345', expect.any(String));
      expect(result.build.id).toBe(12345);
      expect(result.artifacts).toBeUndefined();
      expect(result.statistics).toBeUndefined();
      expect(result.changes).toBeUndefined();
      expect(result.dependencies).toBeUndefined();
    });
  });

  describe('fetchArtifacts', () => {
    it('transforms artifact listing via build files API', async () => {
      stub.modules.builds.getFilesListOfBuild.mockResolvedValue({
        data: {
          file: [
            {
              name: 'app.jar',
              fullName: 'target/app.jar',
              size: 10,
              modificationTime: '20250829T121400+0000',
            },
            {
              name: 'report.html',
              fullName: 'reports/report.html',
              size: 5,
              modificationTime: '20250829T121430+0000',
            },
          ],
        },
      });

      const artifacts = (await managerInternals.fetchArtifacts('12345', {})) as Array<{
        downloadUrl: string;
      }>;

      expect(stub.modules.builds.getFilesListOfBuild).toHaveBeenCalledWith('id:12345');
      expect(artifacts).toHaveLength(2);
      expect(artifacts?.[0]?.downloadUrl).toContain('/artifacts/content/target/app.jar');
    });
  });

  describe('fetchStatistics', () => {
    it('maps TeamCity statistic properties to friendly structure', async () => {
      stub.modules.builds.getBuildStatisticValues.mockResolvedValue({
        data: {
          property: [
            { name: 'BuildDuration', value: '900000' },
            { name: 'TestCount', value: '200' },
            { name: 'PassedTestCount', value: '198' },
            { name: 'FailedTestCount', value: '1' },
            { name: 'CodeCoverageL', value: '85.5' },
          ],
        },
      });

      const statistics = (await managerInternals.fetchStatistics('12345')) as Record<
        string,
        unknown
      >;

      expect(stub.modules.builds.getBuildStatisticValues).toHaveBeenCalledWith('id:12345');
      expect(statistics).toMatchObject({
        buildDuration: 900000,
        testCount: 200,
        passedTests: 198,
        failedTests: 1,
        codeCoverage: 85.5,
      });
    });
  });

  describe('fetchChanges', () => {
    it('normalizes change payloads via change API', async () => {
      stub.modules.changes.getAllChanges.mockResolvedValue({
        data: {
          change: [
            {
              version: 'abc123',
              username: 'dev',
              date: '20250829T120000+0000',
              comment: 'Fix bug',
              files: {
                file: [{ name: 'src/app.ts', changeType: 'EDITED' }, { name: 'README.md' }],
              },
            },
          ],
        },
      });

      const changes = (await managerInternals.fetchChanges('12345')) as Array<{
        revision: string;
        files: Array<unknown>;
      }>;

      expect(stub.modules.changes.getAllChanges).toHaveBeenCalledWith('build:(id:12345)');
      expect(changes?.[0]?.revision).toBe('abc123');
      expect(changes?.[0]?.files).toHaveLength(2);
    });
  });

  describe('fetchDependencies', () => {
    it('uses shared axios request helper for snapshot dependencies', async () => {
      stub.http.get.mockResolvedValueOnce({
        data: {
          build: [
            { id: 1, number: '100', buildTypeId: 'Cfg_A', status: 'SUCCESS' },
            { id: 2, number: '101', buildTypeId: 'Cfg_B', status: 'FAILURE' },
          ],
        },
      });

      const dependencies = (await managerInternals.fetchDependencies('12345')) as Array<{
        buildId: number;
        buildNumber: string;
        buildTypeId: string;
        status: string;
      }>;

      expect(stub.request).toHaveBeenCalledWith(expect.any(Function));
      expect(stub.http.get).toHaveBeenCalledWith(
        `${BASE_URL}/app/rest/builds/id:12345/snapshot-dependencies`
      );
      expect(dependencies).toEqual([
        { buildId: 1, buildNumber: '100', buildTypeId: 'Cfg_A', status: 'SUCCESS' },
        { buildId: 2, buildNumber: '101', buildTypeId: 'Cfg_B', status: 'FAILURE' },
      ]);
    });
  });
});
