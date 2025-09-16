describe('tools: analyze_build_problems', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('passes an id-prefixed locator to getBuildProblems', async () => {
    const getBuild = jest.fn().mockResolvedValue({ status: 'SUCCESS', statusText: 'All good' });
    const getBuildProblems = jest.fn().mockResolvedValue({ data: [] });
    const listTestFailures = jest.fn().mockResolvedValue([]);

    jest.doMock('@/api-client', () => ({
      TeamCityAPI: {
        getInstance: () => ({
          getBuild,
          builds: { getBuildProblems },
          listTestFailures,
        }),
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    await getRequiredTool('analyze_build_problems').handler({ buildId: '123' });

    expect(getBuildProblems).toHaveBeenCalledWith('id:123');
  });
});
