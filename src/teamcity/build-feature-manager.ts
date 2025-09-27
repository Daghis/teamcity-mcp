import type { RawAxiosRequestConfig } from 'axios';

import type { Feature, Properties } from '@/teamcity-client/models';

import type { TeamCityClientAdapter } from './types/client';

type StringMap = Record<string, string>;

interface ManageFeatureInput {
  buildTypeId: string;
  type?: string;
  featureId?: string;
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

export class BuildFeatureManager {
  constructor(private readonly client: TeamCityClientAdapter) {}

  async addFeature(input: ManageFeatureInput): Promise<{ id: string }> {
    const { buildTypeId, type } = input;
    if (!type || type.trim() === '') {
      throw new Error('type is required when adding a build feature.');
    }

    const payload = this.buildPayload(undefined, input);
    payload.type = type;

    const response = await this.client.modules.buildTypes.addBuildFeatureToBuildType(
      buildTypeId,
      undefined,
      payload,
      JSON_HEADERS
    );

    const id = response.data?.id;
    if (!id) {
      throw new Error('TeamCity did not return a feature identifier.');
    }
    return { id };
  }

  async updateFeature(featureId: string, input: ManageFeatureInput): Promise<{ id: string }> {
    const { buildTypeId } = input;
    const existing = await this.fetchFeature(buildTypeId, featureId);
    if (!existing) {
      throw new Error(
        `Feature ${featureId} was not found on ${buildTypeId}; verify the feature ID or update via the TeamCity UI.`
      );
    }

    const payload = this.buildPayload(existing, input);
    await this.client.modules.buildTypes.replaceBuildFeature(
      buildTypeId,
      featureId,
      undefined,
      payload,
      JSON_HEADERS
    );
    return { id: featureId };
  }

  async deleteFeature(buildTypeId: string, featureId: string): Promise<void> {
    await this.client.modules.buildTypes.deleteFeatureOfBuildType(
      buildTypeId,
      featureId,
      JSON_HEADERS
    );
  }

  private async fetchFeature(buildTypeId: string, featureId: string): Promise<Feature | null> {
    try {
      const response = await this.client.modules.buildTypes.getBuildFeature(
        buildTypeId,
        featureId,
        'id,type,disabled,properties(property(name,value))',
        JSON_GET_HEADERS
      );
      return response.data as Feature;
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

  private buildPayload(existing: Feature | undefined, input: ManageFeatureInput): Feature {
    const baseProps = propertiesToRecord(existing?.properties as Properties | undefined);
    const mergedProps = mergeRecords(baseProps, toStringRecord(input.properties));
    const payload: Feature = {
      ...(existing ?? {}),
      disabled: input.disabled ?? existing?.disabled,
    };

    if (existing?.type && !input.type) {
      payload.type = existing.type;
    }
    if (input.type) {
      payload.type = input.type;
    }

    const properties = recordToProperties(mergedProps);
    if (properties) {
      payload.properties = properties;
    }

    return payload;
  }
}
