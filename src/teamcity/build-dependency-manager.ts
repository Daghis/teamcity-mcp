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
  options?: Record<string, unknown>;
  type?: string;
  disabled?: boolean;
};

type SnapshotDependencyOption = {
  name?: string;
  value?: string;
};

type SnapshotDependencyOptions =
  | {
      option?: SnapshotDependencyOption[] | SnapshotDependencyOption | null;
    }
  | null
  | undefined;

type SnapshotDependencyWithOptions = SnapshotDependency & {
  options?: SnapshotDependencyOptions;
};

const XML_HEADERS: RawAxiosRequestConfig = {
  headers: {
    'Content-Type': 'application/xml',
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

const SNAPSHOT_DEPENDENCY_OPTION_KEYS = new Set([
  'run-build-on-the-same-agent',
  'sync-revisions',
  'take-successful-builds-only',
  'take-started-build-with-same-revisions',
  'do-not-run-new-build-if-there-is-a-suitable-one',
]);

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

const optionsToRecord = (options?: SnapshotDependencyOptions): StringMap => {
  if (!options) {
    return {};
  }
  const optionEntries = options?.option;
  const collection = Array.isArray(optionEntries)
    ? optionEntries
    : optionEntries != null
      ? [optionEntries]
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

const recordToOptions = (record: StringMap): SnapshotDependencyOptions | undefined => {
  const entries = Object.entries(record);
  if (entries.length === 0) {
    return undefined;
  }
  return {
    option: entries.map(([name, value]) => ({ name, value })),
  };
};

const mergeRecords = (base: StringMap, override: StringMap): StringMap => {
  const merged: StringMap = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = value;
  }
  return merged;
};

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const attributesToString = (attributes: Record<string, string | undefined>): string => {
  const parts = Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}="${escapeXml(value as string)}"`);
  return parts.length > 0 ? ` ${parts.join(' ')}` : '';
};

const propertiesToXml = (properties?: Properties | undefined): string | undefined => {
  if (!properties) {
    return undefined;
  }
  const entries = properties.property;
  const list = Array.isArray(entries) ? entries : entries != null ? [entries] : [];

  if (list.length === 0) {
    return undefined;
  }

  const nodes = list
    .filter((item) => item?.name)
    .map((item) => {
      const name = item?.name ?? '';
      const value = item?.value != null ? String(item.value) : '';
      return `<property name="${escapeXml(name)}" value="${escapeXml(value)}"/>`;
    });

  if (nodes.length === 0) {
    return undefined;
  }

  return `<properties>${nodes.join('')}</properties>`;
};

const optionsToXml = (options?: SnapshotDependencyOptions | undefined): string | undefined => {
  if (!options) {
    return undefined;
  }
  const entries = options.option;
  const list = Array.isArray(entries) ? entries : entries != null ? [entries] : [];

  if (list.length === 0) {
    return undefined;
  }

  const nodes = list
    .filter((item) => item?.name)
    .map((item) => {
      const name = item?.name ?? '';
      const value = item?.value != null ? String(item.value) : '';
      return `<option name="${escapeXml(name)}" value="${escapeXml(value)}"/>`;
    });

  if (nodes.length === 0) {
    return undefined;
  }

  return `<options>${nodes.join('')}</options>`;
};

const sourceBuildTypeToXml = (
  source?: SnapshotDependency['source-buildType'] | ArtifactDependency['source-buildType']
): string | undefined => {
  if (!source || typeof source !== 'object') {
    return undefined;
  }

  const { id, name } = source as { id?: string; name?: string };
  if (!id) {
    return undefined;
  }

  const attributes: Record<string, string | undefined> = {
    id,
    name,
  };

  return `<source-buildType${attributesToString(attributes)}/>`;
};

const dependencyToXml = (
  dependencyType: DependencyType,
  payload: ArtifactDependency | SnapshotDependency
): string => {
  const root = dependencyType === 'artifact' ? 'artifact-dependency' : 'snapshot-dependency';
  const normalizeTypeAttribute = (value?: string): string | undefined => {
    if (!value) {
      return undefined;
    }
    if (dependencyType === 'snapshot' && value === 'snapshotDependency') {
      return 'snapshot_dependency';
    }
    if (dependencyType === 'artifact' && value === 'artifactDependency') {
      return 'artifact_dependency';
    }
    return value;
  };
  const attributes: Record<string, string | undefined> = {
    id: typeof payload.id === 'string' && payload.id.trim() !== '' ? payload.id : undefined,
    name: typeof payload.name === 'string' && payload.name.trim() !== '' ? payload.name : undefined,
    type:
      typeof payload.type === 'string' && payload.type.trim() !== ''
        ? normalizeTypeAttribute(payload.type)
        : undefined,
    disabled:
      typeof payload.disabled === 'boolean' ? (payload.disabled ? 'true' : 'false') : undefined,
    inherited:
      typeof payload.inherited === 'boolean' ? (payload.inherited ? 'true' : 'false') : undefined,
  };

  const fragments: string[] = [];
  const sourceBuildTypeXml = sourceBuildTypeToXml(
    payload['source-buildType'] as SnapshotDependency['source-buildType']
  );
  if (sourceBuildTypeXml) {
    fragments.push(sourceBuildTypeXml);
  }

  const propertiesXml = propertiesToXml(payload.properties);
  if (propertiesXml) {
    fragments.push(propertiesXml);
  }

  const optionsXml = optionsToXml((payload as SnapshotDependencyWithOptions).options);
  if (optionsXml) {
    fragments.push(optionsXml);
  }

  return `<${root}${attributesToString(attributes)}>${fragments.join('')}</${root}>`;
};

const prepareArtifactRequest = (
  payload: ArtifactDependency
): { body: string; headers: RawAxiosRequestConfig } => ({
  body: dependencyToXml('artifact', payload),
  headers: XML_HEADERS,
});

const prepareSnapshotRequest = (
  payload: SnapshotDependency
): { body: string; headers: RawAxiosRequestConfig } => ({
  body: dependencyToXml('snapshot', payload),
  headers: XML_HEADERS,
});

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
        JSON_GET_HEADERS
      );
      return;
    }

    await this.client.modules.buildTypes.deleteSnapshotDependency(
      buildTypeId,
      dependencyId,
      JSON_GET_HEADERS
    );
  }

  private async createDependency(
    dependencyType: DependencyType,
    buildTypeId: string,
    payload: ArtifactDependency | SnapshotDependency
  ): Promise<AxiosResponse<DependencyResource>> {
    if (dependencyType === 'artifact') {
      const { body, headers } = prepareArtifactRequest(payload as ArtifactDependency);
      // Generated client expects an ArtifactDependency body, but the endpoint requires XML.
      return this.client.modules.buildTypes.addArtifactDependencyToBuildType(
        buildTypeId,
        undefined,
        body as unknown as ArtifactDependency,
        headers
      );
    }

    const { body, headers } = prepareSnapshotRequest(payload as SnapshotDependency);
    // Generated client expects a SnapshotDependency body, but the endpoint requires XML.
    return this.client.modules.buildTypes.addSnapshotDependencyToBuildType(
      buildTypeId,
      undefined,
      body as unknown as SnapshotDependency,
      headers
    );
  }

  private async replaceDependency(
    dependencyType: DependencyType,
    buildTypeId: string,
    dependencyId: string,
    payload: ArtifactDependency | SnapshotDependency
  ): Promise<AxiosResponse<DependencyResource>> {
    if (dependencyType === 'artifact') {
      const { body, headers } = prepareArtifactRequest(payload as ArtifactDependency);
      // Generated client expects an ArtifactDependency body, but the endpoint requires XML.
      return this.client.modules.buildTypes.replaceArtifactDependency(
        buildTypeId,
        dependencyId,
        undefined,
        body as unknown as ArtifactDependency,
        headers
      );
    }

    const { body, headers } = prepareSnapshotRequest(payload as SnapshotDependency);
    // Generated client expects a SnapshotDependency body, but the endpoint requires XML.
    return this.client.modules.buildTypes.replaceSnapshotDependency(
      buildTypeId,
      dependencyId,
      undefined,
      body as unknown as SnapshotDependency,
      headers
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
        "id,type,disabled,properties(property(name,value)),options(option(name,value)),'source-buildType'(id)",
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
    const existingSnapshot = existing as SnapshotDependencyWithOptions | undefined;
    const baseProperties = propertiesToRecord(existing?.properties as Properties | undefined);
    const inputPropertyRecord = toStringRecord(input.properties);
    const inputExplicitOptions = toStringRecord(input.options);

    let optionOverrides: StringMap = {};
    let propertyOverrides: StringMap = inputPropertyRecord;

    let baseOptions: StringMap = {};
    if (dependencyType === 'snapshot') {
      baseOptions = optionsToRecord(existingSnapshot?.options);
      const knownOptionKeys = new Set<string>([
        ...Object.keys(baseOptions),
        ...Object.keys(inputExplicitOptions),
      ]);
      for (const key of SNAPSHOT_DEPENDENCY_OPTION_KEYS) {
        knownOptionKeys.add(key);
      }

      const derivedOptionOverrides: StringMap = { ...inputExplicitOptions };
      const derivedPropertyOverrides: StringMap = {};

      for (const [key, value] of Object.entries(inputPropertyRecord)) {
        if (knownOptionKeys.has(key)) {
          derivedOptionOverrides[key] = value;
        } else {
          derivedPropertyOverrides[key] = value;
        }
      }

      optionOverrides = derivedOptionOverrides;
      propertyOverrides = derivedPropertyOverrides;
    } else if (Object.keys(inputExplicitOptions).length > 0) {
      optionOverrides = inputExplicitOptions;
    }

    const mergedProps = mergeRecords(baseProperties, propertyOverrides);
    const properties = recordToProperties(mergedProps);

    let mergedOptions: StringMap = {};
    if (dependencyType === 'snapshot') {
      mergedOptions = mergeRecords(baseOptions, optionOverrides);
    }

    const resolvedType = input.type ?? existing?.type ?? defaultTypeFor(dependencyType);

    const payload: ArtifactDependency | SnapshotDependencyWithOptions = {
      ...(existing ?? {}),
      disabled: input.disabled ?? existing?.disabled,
    };

    if (resolvedType) {
      payload.type = resolvedType;
    }
    if (properties) {
      payload.properties = properties;
    } else {
      delete payload.properties;
    }

    if (dependencyType === 'snapshot') {
      const options = recordToOptions(mergedOptions);
      if (options) {
        (payload as SnapshotDependencyWithOptions).options = options;
      } else {
        delete (payload as SnapshotDependencyWithOptions).options;
      }
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
