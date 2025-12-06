import { AgentRequirementsManager } from '@/teamcity/agent-requirements-manager';
import type { TeamCityClientAdapter } from '@/teamcity/types/client';

jest.mock('@/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

type BuildTypesMocks = {
  addAgentRequirementToBuildType: jest.Mock;
  replaceAgentRequirement: jest.Mock;
  deleteAgentRequirement: jest.Mock;
  getAgentRequirement: jest.Mock;
};

type ClientMocks = {
  modules: {
    buildTypes: BuildTypesMocks;
  };
};

const createClientMock = (): ClientMocks => ({
  modules: {
    buildTypes: {
      addAgentRequirementToBuildType: jest.fn(),
      replaceAgentRequirement: jest.fn(),
      deleteAgentRequirement: jest.fn(),
      getAgentRequirement: jest.fn(),
    },
  },
});

describe('AgentRequirementsManager', () => {
  let client: ClientMocks;
  let manager: AgentRequirementsManager;

  beforeEach(() => {
    client = createClientMock();
    manager = new AgentRequirementsManager(client as unknown as TeamCityClientAdapter);
  });

  test('addRequirement returns created identifier', async () => {
    client.modules.buildTypes.addAgentRequirementToBuildType.mockResolvedValue({
      data: { id: 'req1' },
    });

    const result = await manager.addRequirement({ buildTypeId: 'BuildCfg' });

    expect(result).toEqual({ id: 'req1' });
    expect(client.modules.buildTypes.addAgentRequirementToBuildType).toHaveBeenCalledWith(
      'BuildCfg',
      undefined,
      '<agent-requirement></agent-requirement>',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/xml',
        }),
      })
    );
  });

  test('addRequirement throws when TeamCity omits identifier', async () => {
    client.modules.buildTypes.addAgentRequirementToBuildType.mockResolvedValue({ data: {} });

    await expect(manager.addRequirement({ buildTypeId: 'BuildCfg' })).rejects.toThrow(
      'TeamCity did not return an agent requirement identifier'
    );
  });

  test('updateRequirement merges existing properties and flags', async () => {
    client.modules.buildTypes.getAgentRequirement.mockResolvedValue({
      data: {
        id: 'req1',
        disabled: false,
        properties: {
          property: [{ name: 'env.EXISTING', value: 'old' }],
        },
      },
    });
    client.modules.buildTypes.replaceAgentRequirement.mockResolvedValue({ data: {} });

    const result = await manager.updateRequirement('req1', {
      buildTypeId: 'BuildCfg',
      properties: { 'env.NEW': 'value', flag: true },
      disabled: true,
    });

    expect(result).toEqual({ id: 'req1' });
    // Arguments: buildTypeId, requirementId, fields, body, headers
    const [buildTypeId, requirementId, fields, xmlBody, headers] =
      client.modules.buildTypes.replaceAgentRequirement.mock.calls[0];

    expect(buildTypeId).toBe('BuildCfg');
    expect(requirementId).toBe('req1');
    expect(fields).toBeUndefined();

    // Verify XML structure
    expect(xmlBody).toContain('<agent-requirement');
    expect(xmlBody).toContain('id="req1"');
    expect(xmlBody).toContain('disabled="true"');
    expect(xmlBody).toContain('<properties>');
    expect(xmlBody).toContain('name="env.EXISTING" value="old"');
    expect(xmlBody).toContain('name="env.NEW" value="value"');
    expect(xmlBody).toContain('name="flag" value="true"');

    // Verify headers
    expect(headers).toMatchObject({
      headers: expect.objectContaining({
        'Content-Type': 'application/xml',
      }),
    });
  });

  test('updateRequirement throws when requirement is missing', async () => {
    client.modules.buildTypes.getAgentRequirement.mockRejectedValue({
      response: { status: 404 },
    });

    await expect(manager.updateRequirement('missing', { buildTypeId: 'BuildCfg' })).rejects.toThrow(
      /was not found/
    );
  });

  test('deleteRequirement delegates to API', async () => {
    client.modules.buildTypes.deleteAgentRequirement.mockResolvedValue({});

    await manager.deleteRequirement('BuildCfg', 'req1');

    expect(client.modules.buildTypes.deleteAgentRequirement).toHaveBeenCalledWith(
      'BuildCfg',
      'req1',
      expect.any(Object)
    );
  });
});
