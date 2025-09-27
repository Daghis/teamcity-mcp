import type { RawAxiosRequestConfig } from 'axios';

import type { AgentRequirement, Properties } from '@/teamcity-client/models';

import type { TeamCityClientAdapter } from './types/client';

type StringMap = Record<string, string>;

interface ManageRequirementInput {
  buildTypeId: string;
  requirementId?: string;
  properties?: Record<string, unknown>;
  disabled?: boolean;
}

const JSON_HEADERS: RawAxiosRequestConfig = {
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
};

const JSON_GET_HEADERS: RawAxiosRequestConfig = {
  headers: {
    Accept: 'application/json',
  },
};

const toStringRecord = (input?: Record<string, unknown>): StringMap => {
  if (!input) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(input).map(([name, value]) => {
      if (value === undefined || value === null) {
        return [name, ''];
      }
      if (typeof value === 'boolean') {
        return [name, value ? 'true' : 'false'];
      }
      return [name, String(value)];
    })
  );
};

const propertiesToRecord = (properties?: Properties | null): StringMap => {
  if (properties == null) {
    return {};
  }
  const propertyEntries = properties.property;
  const items = Array.isArray(propertyEntries)
    ? propertyEntries
    : propertyEntries != null
      ? [propertyEntries]
      : [];
  const record: StringMap = {};
  for (const item of items) {
    if (!item?.name) {
      continue;
    }
    record[item.name] = item.value != null ? String(item.value) : '';
  }
  return record;
};

const recordToProperties = (record: StringMap): Properties | undefined => {
  const entries = Object.entries(record);
  if (entries.length === 0) {
    return undefined;
  }
  return {
    property: entries.map(([name, value]) => ({ name, value })),
  };
};

const mergeRecords = (base: StringMap, override: StringMap): StringMap => ({
  ...base,
  ...override,
});

export class AgentRequirementsManager {
  constructor(private readonly client: TeamCityClientAdapter) {}

  async addRequirement(input: ManageRequirementInput): Promise<{ id: string }> {
    const { buildTypeId } = input;
    const payload = this.buildPayload(undefined, input);

    const response = await this.client.modules.buildTypes.addAgentRequirementToBuildType(
      buildTypeId,
      undefined,
      payload,
      JSON_HEADERS
    );

    const id = response.data?.id;
    if (!id) {
      throw new Error('TeamCity did not return an agent requirement identifier.');
    }
    return { id };
  }

  async updateRequirement(
    requirementId: string,
    input: ManageRequirementInput
  ): Promise<{ id: string }> {
    const { buildTypeId } = input;
    const existing = await this.fetchRequirement(buildTypeId, requirementId);
    if (!existing) {
      throw new Error(
        `Agent requirement ${requirementId} was not found on ${buildTypeId}; verify the ID or update via the TeamCity UI.`
      );
    }

    const payload = this.buildPayload(existing, input);
    await this.client.modules.buildTypes.replaceAgentRequirement(
      buildTypeId,
      requirementId,
      undefined,
      payload,
      JSON_HEADERS
    );
    return { id: requirementId };
  }

  async deleteRequirement(buildTypeId: string, requirementId: string): Promise<void> {
    await this.client.modules.buildTypes.deleteAgentRequirement(
      buildTypeId,
      requirementId,
      JSON_HEADERS
    );
  }

  private async fetchRequirement(
    buildTypeId: string,
    requirementId: string
  ): Promise<AgentRequirement | null> {
    try {
      const response = await this.client.modules.buildTypes.getAgentRequirement(
        buildTypeId,
        requirementId,
        'id,type,disabled,properties(property(name,value))',
        JSON_GET_HEADERS
      );
      return response.data as AgentRequirement;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        (error as { response?: { status?: number } }).response?.status === 404
      ) {
        return null;
      }
      throw error;
    }
  }

  private buildPayload(
    existing: AgentRequirement | undefined,
    input: ManageRequirementInput
  ): AgentRequirement {
    const baseProps = propertiesToRecord(existing?.properties as Properties | undefined);
    const mergedProps = mergeRecords(baseProps, toStringRecord(input.properties));
    const payload: AgentRequirement = {
      ...(existing ?? {}),
      disabled: input.disabled ?? existing?.disabled,
    };

    const properties = recordToProperties(mergedProps);
    if (properties) {
      payload.properties = properties;
    }

    return payload;
  }
}
