import { getRequiredTool } from '@/tools';

describe('list_branches validation and listing', () => {
  it('rejects when neither projectId nor buildTypeId provided', async () => {
    const res = await getRequiredTool('list_branches').handler({});
    // Expect schema validation to surface an error
    const msg = res.error ?? (res.content?.[0]?.text as string) ?? '';
    expect(msg).toMatch(/Either projectId or buildTypeId is required/);
  });
});

// Mock for list_parameters
jest.mock('@/api-client', () => ({
  TeamCityAPI: {
    getInstance: () => ({
      getBuildType: async (id: string) => ({
        id,
        parameters: {
          property: [
            { name: 'env.FOO', value: 'bar' },
            { name: 'opt', value: '1' },
          ],
        },
      }),
    }),
  },
}));

describe('list_parameters', () => {
  it('returns parameters and count', async () => {
    const res = await getRequiredTool('list_parameters').handler({ buildTypeId: 'bt1' });
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.parameters).toHaveLength(2);
    expect(payload.count).toBe(2);
  });
});
