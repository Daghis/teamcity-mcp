import { TeamCityAPI } from '@/api-client';
import { getRequiredTool } from '@/tools';

describe('tools: update_project_settings', () => {
  const prevMode = process.env['MCP_MODE'];
  beforeAll(() => {
    process.env['MCP_MODE'] = 'full';
  });
  afterAll(() => {
    if (typeof prevMode === 'undefined') delete process.env['MCP_MODE'];
    else process.env['MCP_MODE'] = prevMode;
  });
  const tool = getRequiredTool('update_project_settings');

  it('updates only provided name', async () => {
    const setProjectField = jest.fn().mockResolvedValue({});
    jest.spyOn(TeamCityAPI, 'getInstance').mockReturnValue({
      projects: { setProjectField },
    } as unknown as TeamCityAPI);

    const args = { projectId: 'MyProj', name: 'TeamCity MCP' };
    const result = await tool.handler(args);

    const payload = JSON.parse((result.content?.[0]?.text as string) ?? '{}');
    expect(payload).toMatchObject({
      success: true,
      action: 'update_project_settings',
      id: 'MyProj',
    });
  });

  it('updates description and archived with proper types', async () => {
    const setProjectField = jest.fn().mockResolvedValue({});
    jest.spyOn(TeamCityAPI, 'getInstance').mockReturnValue({
      projects: { setProjectField },
    } as unknown as TeamCityAPI);

    const args = { projectId: 'MyProj', description: 'Correct casing', archived: true };
    const result = await tool.handler(args);
    const payload = JSON.parse((result.content?.[0]?.text as string) ?? '{}');
    expect(payload).toMatchObject({
      success: true,
      action: 'update_project_settings',
      id: 'MyProj',
    });
  });

  it('does nothing when no fields provided', async () => {
    const setProjectField = jest.fn().mockResolvedValue({});
    jest.spyOn(TeamCityAPI, 'getInstance').mockReturnValue({
      projects: { setProjectField },
    } as unknown as TeamCityAPI);

    const args = { projectId: 'OnlyId' };
    const result = await tool.handler(args);
    const payload = JSON.parse((result.content?.[0]?.text as string) ?? '{}');
    expect(payload).toMatchObject({
      success: true,
      action: 'update_project_settings',
      id: 'OnlyId',
    });
  });
});
