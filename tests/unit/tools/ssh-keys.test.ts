jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'full',
}));

describe('tools: SSH key management', () => {
  it('list_project_ssh_keys calls GET and returns keys', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const mockGet = jest.fn(async () => ({
            data: { sshKey: [{ name: 'my-key' }, { name: 'other-key' }] },
          }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({ http: { get: mockGet } }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('list_project_ssh_keys').handler({
            projectId: 'MyProject',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'list_project_ssh_keys',
            projectId: 'MyProject',
          });
          expect(payload.sshKeys).toEqual({
            sshKey: [{ name: 'my-key' }, { name: 'other-key' }],
          });
          expect(mockGet).toHaveBeenCalledWith('/app/rest/projects/MyProject/sshKeys', {
            headers: { Accept: 'application/json' },
          });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('upload_project_ssh_key with privateKeyContent calls POST', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const mockPost = jest.fn(async () => ({ data: {} }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({ http: { post: mockPost } }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('upload_project_ssh_key').handler({
            projectId: 'MyProject',
            keyName: 'deploy-key',
            privateKeyContent:
              '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'upload_project_ssh_key',
            projectId: 'MyProject',
            keyName: 'deploy-key',
          });
          expect(mockPost).toHaveBeenCalledTimes(1);
          const [url, body] = mockPost.mock.calls[0] as unknown as [string, FormData];
          expect(url).toBe('/app/rest/projects/MyProject/sshKeys?name=deploy-key');
          expect(body).toBeInstanceOf(FormData);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('upload_project_ssh_key with privateKeyPath reads file', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const mockPost = jest.fn(async () => ({ data: {} }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({ http: { post: mockPost } }),
            },
          }));
          jest.doMock('node:fs', () => ({
            ...jest.requireActual('node:fs'),
            promises: {
              readFile: jest.fn(
                async () => '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----'
              ),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('upload_project_ssh_key').handler({
            projectId: 'MyProject',
            keyName: 'deploy-key',
            privateKeyPath: '/home/user/.ssh/id_rsa',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'upload_project_ssh_key',
            projectId: 'MyProject',
            keyName: 'deploy-key',
          });
          expect(mockPost).toHaveBeenCalledTimes(1);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('upload_project_ssh_key fails when neither content nor path provided', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({ http: { post: jest.fn() } }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          await expect(
            getRequiredTool('upload_project_ssh_key').handler({
              projectId: 'MyProject',
              keyName: 'deploy-key',
            })
          ).rejects.toThrow(/privateKeyContent.*privateKeyPath/i);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('upload_project_ssh_key fails when both content and path provided', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({ http: { post: jest.fn() } }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          await expect(
            getRequiredTool('upload_project_ssh_key').handler({
              projectId: 'MyProject',
              keyName: 'deploy-key',
              privateKeyContent: 'key-content',
              privateKeyPath: '/path/to/key',
            })
          ).rejects.toThrow(/only one/i);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('delete_project_ssh_key calls DELETE', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const mockDelete = jest.fn(async () => ({ data: {} }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({ http: { delete: mockDelete } }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('delete_project_ssh_key').handler({
            projectId: 'MyProject',
            keyName: 'old-key',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'delete_project_ssh_key',
            projectId: 'MyProject',
            keyName: 'old-key',
          });
          expect(mockDelete).toHaveBeenCalledWith(
            '/app/rest/projects/MyProject/sshKeys?name=old-key'
          );
          resolve();
        })().catch(reject);
      });
    });
  });

  it('list_project_ssh_keys encodes project IDs with special characters', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const mockGet = jest.fn(async () => ({ data: { sshKey: [] } }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({ http: { get: mockGet } }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          await getRequiredTool('list_project_ssh_keys').handler({
            projectId: 'My Project/Sub',
          });
          expect(mockGet).toHaveBeenCalledWith('/app/rest/projects/My%20Project%2FSub/sshKeys', {
            headers: { Accept: 'application/json' },
          });
          resolve();
        })().catch(reject);
      });
    });
  });
});
