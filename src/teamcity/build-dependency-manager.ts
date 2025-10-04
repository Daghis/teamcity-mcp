import type { AxiosResponse, RawAxiosRequestConfig } from 'axios';

import type { ArtifactDependency, Properties, SnapshotDependency } from '@/teamcity-client/models';

import type { TeamCityClientAdapter } from './types/client';

type DependencyResource = ArtifactDependency | SnapshotDependency;

type DependencyType = 'artifact' | 'snapshot';

type StringMap = Record<string, string>;

type ManageDependencyInput = {
  buildTypeId: string;
  dependencyType: DependencyType;
  dependsOn?: string;
  properties?: Record<string, unknown>;
  type?: string;
  disabled?: boolean;
};

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

const defaultTypeFor = (dependencyType: DependencyType): string | undefined => {
  switch (dependencyType) {
    case 'artifact':
      return 'artifactDependency';
    case 'snapshot':
      return 'snapshotDependency';
    default:
      return undefined;
  }
};

const toStringRecord = (input?: Record<string, unknown>): StringMap => {
  if (!input) {
    return {};
  }
  const entries = Object.entries(input).map(([name, value]) => {
    if (value === undefined || value === null) {
      return [name, ''];
    }
    if (typeof value === 'boolean') {
      return [name, value ? 'true' : 'false'];
    }
    return [name, String(value)];
  });
  return Object.fromEntries(entries);
};

const propertiesToRecord = (properties?: Properties | null): StringMap => {
  if (properties == null) {
    return {};
  }
  const propertyEntries = properties.property;
  const collection = Array.isArray(propertyEntries)
    ? propertyEntries
    : propertyEntries != null
      ? [propertyEntries]
      : [];
  const map: StringMap = {};
  for (const item of collection) {
    if (!item?.name) {
      continue;
    }
    map[item.name] = item.value != null ? String(item.value) : '';
  }
  return map;
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

const mergeRecords = (base: StringMap, override: StringMap): StringMap => {
  const merged: StringMap = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = value;
  }
  return merged;
};

export class BuildDependencyManager {
  constructor(private readonly client: TeamCityClientAdapter) {}

  async addDependency(input: ManageDependencyInput): Promise<{ id: string }> {
    const { buildTypeId, dependencyType, dependsOn } = input;
    if (!dependsOn || dependsOn.trim() === '') {
      throw new Error(
        'dependsOn is required when adding a dependency; specify the upstream build configuration ID or use the TeamCity UI.'
      );
    }

    const payload = this.buildPayload(dependencyType, undefined, {
      ...input,
      dependsOn,
    });

    const response = await this.createDependency(dependencyType, buildTypeId, payload);

    const id = response.data?.id;
    if (!id) {
      throw new Error('TeamCity did not return a dependency identifier. Verify server response.');
    }

    return { id };
  }

  async updateDependency(
    dependencyId: string,
    input: ManageDependencyInput
  ): Promise<{ id: string }> {
    const { buildTypeId, dependencyType } = input;
    const existing = await this.fetchDependency(dependencyType, buildTypeId, dependencyId);
    if (!existing) {
      throw new Error(
        `Dependency ${dependencyId} was not found on ${buildTypeId}; verify the identifier or update via the TeamCity UI.`
      );
    }

    const payload = this.buildPayload(dependencyType, existing, input);
    await this.replaceDependency(dependencyType, buildTypeId, dependencyId, payload);
    return { id: dependencyId };
  }

  async deleteDependency(
    dependencyType: DependencyType,
    buildTypeId: string,
    dependencyId: string
  ): Promise<void> {
    if (!dependencyId) {
      throw new Error('dependencyId is required to delete a dependency.');
    }

    if (dependencyType === 'artifact') {
      await this.client.modules.buildTypes.deleteArtifactDependency(
        buildTypeId,
        dependencyId,
        JSON_HEADERS
      );
      return;
    }

    await this.client.modules.buildTypes.deleteSnapshotDependency(
      buildTypeId,
      dependencyId,
      JSON_HEADERS
    );
  }

  private async createDependency(
    dependencyType: DependencyType,
    buildTypeId: string,
    payload: ArtifactDependency | SnapshotDependency
  ): Promise<AxiosResponse<DependencyResource>> {
    if (dependencyType === 'artifact') {
      return this.client.modules.buildTypes.addArtifactDependencyToBuildType(
        buildTypeId,
        undefined,
        payload,
        JSON_HEADERS
      );
    }

    return this.client.modules.buildTypes.addSnapshotDependencyToBuildType(
      buildTypeId,
      undefined,
      payload,
      JSON_HEADERS
    );
  }

  private async replaceDependency(
    dependencyType: DependencyType,
    buildTypeId: string,
    dependencyId: string,
    payload: ArtifactDependency | SnapshotDependency
  ): Promise<AxiosResponse<DependencyResource>> {
    if (dependencyType === 'artifact') {
      return this.client.modules.buildTypes.replaceArtifactDependency(
        buildTypeId,
        dependencyId,
        undefined,
        payload,
        JSON_HEADERS
      );
    }

    return this.client.modules.buildTypes.replaceSnapshotDependency(
      buildTypeId,
      dependencyId,
      undefined,
      payload,
      JSON_HEADERS
    );
  }

  private async fetchDependency(
    dependencyType: DependencyType,
    buildTypeId: string,
    dependencyId: string
  ): Promise<DependencyResource | null> {
    try {
      if (dependencyType === 'artifact') {
        const response = await this.client.modules.buildTypes.getArtifactDependency(
          buildTypeId,
          dependencyId,
          "id,type,disabled,properties(property(name,value)),'source-buildType'(id)",
          JSON_GET_HEADERS
        );
        return response.data as ArtifactDependency;
      }

      const response = await this.client.modules.buildTypes.getSnapshotDependency(
        buildTypeId,
        dependencyId,
        "id,type,disabled,properties(property(name,value)),'source-buildType'(id)",
        JSON_GET_HEADERS
      );
      return response.data as SnapshotDependency;
    } catch (error) {
      if (this.isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  private buildPayload(
    dependencyType: DependencyType,
    existing: DependencyResource | undefined,
    input: ManageDependencyInput
  ): ArtifactDependency | SnapshotDependency {
    const baseProps = propertiesToRecord(existing?.properties as Properties | undefined);
    const mergedProps = mergeRecords(baseProps, toStringRecord(input.properties));
    const properties = recordToProperties(mergedProps);
    const resolvedType = input.type ?? existing?.type ?? defaultTypeFor(dependencyType);

    const payload: ArtifactDependency | SnapshotDependency = {
      ...(existing ?? {}),
      disabled: input.disabled ?? existing?.disabled,
    };

    if (resolvedType) {
      payload.type = resolvedType;
    }
    if (properties) {
      payload.properties = properties;
    }

    const dependsOn = input.dependsOn ?? existing?.['source-buildType']?.id;
    if (dependsOn) {
      payload['source-buildType'] = { id: dependsOn };
    } else {
      delete payload['source-buildType'];
    }

    return payload;
  }

  private isNotFound(error: unknown): boolean {
    return Boolean(
      typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        (error as { response?: { status?: number } }).response?.status === 404
    );
  }
}
