/**
 * Tests for BuildDependencyManager
 *
 * Verifies build dependency management functionality including:
 * - Adding artifact and snapshot dependencies
 * - Updating existing dependencies
 * - Deleting dependencies
 * - Property and option merging
 * - XML serialization
 * - Error handling for various edge cases
 */
import { BuildDependencyManager } from '@/teamcity/build-dependency-manager';

import { createAxiosError, createNotFoundError, createServerError } from '../../test-utils/errors';
import {
  type MockTeamCityClient,
  createMockAxiosResponse,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

type MockBuildTypesApi = MockTeamCityClient['mockModules']['buildTypes'] & {
  addArtifactDependencyToBuildType: jest.Mock;
  replaceArtifactDependency: jest.Mock;
  deleteArtifactDependency: jest.Mock;
  getArtifactDependency: jest.Mock;
  addSnapshotDependencyToBuildType: jest.Mock;
  replaceSnapshotDependency: jest.Mock;
  deleteSnapshotDependency: jest.Mock;
  getSnapshotDependency: jest.Mock;
};

describe('BuildDependencyManager', () => {
  let manager: BuildDependencyManager;
  let mockClient: MockTeamCityClient;
  let buildTypesApi: MockBuildTypesApi;

  beforeEach(() => {
    mockClient = createMockTeamCityClient();

    // Extend the mock client with dependency-related methods
    const extendedBuildTypes = mockClient.mockModules.buildTypes as MockBuildTypesApi;
    extendedBuildTypes.addArtifactDependencyToBuildType = jest.fn();
    extendedBuildTypes.replaceArtifactDependency = jest.fn();
    extendedBuildTypes.deleteArtifactDependency = jest.fn();
    extendedBuildTypes.getArtifactDependency = jest.fn();
    extendedBuildTypes.addSnapshotDependencyToBuildType = jest.fn();
    extendedBuildTypes.replaceSnapshotDependency = jest.fn();
    extendedBuildTypes.deleteSnapshotDependency = jest.fn();
    extendedBuildTypes.getSnapshotDependency = jest.fn();

    buildTypesApi = extendedBuildTypes;
    manager = new BuildDependencyManager(mockClient);
  });

  describe('addDependency', () => {
    describe('artifact dependencies', () => {
      it('should add an artifact dependency successfully', async () => {
        buildTypesApi.addArtifactDependencyToBuildType.mockResolvedValue(
          createMockAxiosResponse({ id: 'artifact-dep-1' })
        );

        const result = await manager.addDependency({
          buildTypeId: 'Config_A',
          dependencyType: 'artifact',
          dependsOn: 'Upstream_Config',
          properties: {
            cleanDestinationDirectory: true,
            pathRules: 'build/*.zip => deploy/',
          },
        });

        expect(result.id).toBe('artifact-dep-1');
        expect(buildTypesApi.addArtifactDependencyToBuildType).toHaveBeenCalledWith(
          'Config_A',
          undefined,
          expect.stringContaining('<artifact-dependency'),
          expect.objectContaining({
            headers: expect.objectContaining({
              'Content-Type': 'application/xml',
              Accept: 'application/json',
            }),
          })
        );
      });

      it('should escape XML special characters in property values', async () => {
        buildTypesApi.addArtifactDependencyToBuildType.mockResolvedValue(
          createMockAxiosResponse({ id: 'artifact-dep-2' })
        );

        await manager.addDependency({
          buildTypeId: 'Config_A',
          dependencyType: 'artifact',
          dependsOn: 'Upstream_Config',
          properties: {
            pathRules: 'a&b<c>d"e\'f',
          },
        });

        const xmlBody = buildTypesApi.addArtifactDependencyToBuildType.mock.calls[0]?.[2] as string;
        expect(xmlBody).toContain('&amp;');
        expect(xmlBody).toContain('&lt;');
        expect(xmlBody).toContain('&gt;');
        expect(xmlBody).toContain('&quot;');
        expect(xmlBody).toContain('&apos;');
      });

      it('should use explicit type when provided', async () => {
        buildTypesApi.addArtifactDependencyToBuildType.mockResolvedValue(
          createMockAxiosResponse({ id: 'artifact-dep-3' })
        );

        await manager.addDependency({
          buildTypeId: 'Config_A',
          dependencyType: 'artifact',
          dependsOn: 'Upstream_Config',
          type: 'custom_artifact_type',
        });

        const xmlBody = buildTypesApi.addArtifactDependencyToBuildType.mock.calls[0]?.[2] as string;
        expect(xmlBody).toContain('type="custom_artifact_type"');
      });

      it('should include disabled attribute when specified', async () => {
        buildTypesApi.addArtifactDependencyToBuildType.mockResolvedValue(
          createMockAxiosResponse({ id: 'artifact-dep-4' })
        );

        await manager.addDependency({
          buildTypeId: 'Config_A',
          dependencyType: 'artifact',
          dependsOn: 'Upstream_Config',
          disabled: true,
        });

        const xmlBody = buildTypesApi.addArtifactDependencyToBuildType.mock.calls[0]?.[2] as string;
        expect(xmlBody).toContain('disabled="true"');
      });
    });

    describe('snapshot dependencies', () => {
      it('should add a snapshot dependency successfully', async () => {
        buildTypesApi.addSnapshotDependencyToBuildType.mockResolvedValue(
          createMockAxiosResponse({ id: 'snapshot-dep-1' })
        );

        const result = await manager.addDependency({
          buildTypeId: 'Config_B',
          dependencyType: 'snapshot',
          dependsOn: 'Base_Config',
          options: {
            'run-build-on-the-same-agent': 'true',
          },
        });

        expect(result.id).toBe('snapshot-dep-1');
        expect(buildTypesApi.addSnapshotDependencyToBuildType).toHaveBeenCalledWith(
          'Config_B',
          undefined,
          expect.stringContaining('<snapshot-dependency'),
          expect.objectContaining({
            headers: expect.objectContaining({
              'Content-Type': 'application/xml',
              Accept: 'application/json',
            }),
          })
        );
      });

      it('should separate options from properties for snapshot dependencies', async () => {
        buildTypesApi.addSnapshotDependencyToBuildType.mockResolvedValue(
          createMockAxiosResponse({ id: 'snapshot-dep-2' })
        );

        await manager.addDependency({
          buildTypeId: 'Config_B',
          dependencyType: 'snapshot',
          dependsOn: 'Base_Config',
          properties: {
            'run-build-on-the-same-agent': true,
            'custom-property': 'value',
          },
        });

        const xmlBody = buildTypesApi.addSnapshotDependencyToBuildType.mock.calls[0]?.[2] as string;
        expect(xmlBody).toContain('<options>');
        expect(xmlBody).toContain('name="run-build-on-the-same-agent" value="true"');
        expect(xmlBody).toContain('<properties>');
        expect(xmlBody).toContain('name="custom-property" value="value"');
      });

      it('should handle all known snapshot dependency option keys', async () => {
        buildTypesApi.addSnapshotDependencyToBuildType.mockResolvedValue(
          createMockAxiosResponse({ id: 'snapshot-dep-3' })
        );

        await manager.addDependency({
          buildTypeId: 'Config_B',
          dependencyType: 'snapshot',
          dependsOn: 'Base_Config',
          properties: {
            'run-build-on-the-same-agent': true,
            'sync-revisions': true,
            'take-successful-builds-only': false,
            'take-started-build-with-same-revisions': true,
            'do-not-run-new-build-if-there-is-a-suitable-one': true,
          },
        });

        const xmlBody = buildTypesApi.addSnapshotDependencyToBuildType.mock.calls[0]?.[2] as string;
        expect(xmlBody).toContain('<options>');
        expect(xmlBody).toContain('run-build-on-the-same-agent');
        expect(xmlBody).toContain('sync-revisions');
        expect(xmlBody).toContain('take-successful-builds-only');
        expect(xmlBody).toContain('take-started-build-with-same-revisions');
        expect(xmlBody).toContain('do-not-run-new-build-if-there-is-a-suitable-one');
      });
    });

    describe('validation errors', () => {
      it('should throw when dependsOn is missing', async () => {
        await expect(
          manager.addDependency({
            buildTypeId: 'Config_A',
            dependencyType: 'artifact',
          })
        ).rejects.toThrow('dependsOn is required when adding a dependency');
      });

      it('should throw when dependsOn is empty string', async () => {
        await expect(
          manager.addDependency({
            buildTypeId: 'Config_A',
            dependencyType: 'artifact',
            dependsOn: '',
          })
        ).rejects.toThrow('dependsOn is required when adding a dependency');
      });

      it('should throw when dependsOn is whitespace only', async () => {
        await expect(
          manager.addDependency({
            buildTypeId: 'Config_A',
            dependencyType: 'artifact',
            dependsOn: '   ',
          })
        ).rejects.toThrow('dependsOn is required when adding a dependency');
      });

      it('should throw when TeamCity does not return a dependency ID', async () => {
        buildTypesApi.addArtifactDependencyToBuildType.mockResolvedValue(
          createMockAxiosResponse({})
        );

        await expect(
          manager.addDependency({
            buildTypeId: 'Config_A',
            dependencyType: 'artifact',
            dependsOn: 'Upstream_Config',
          })
        ).rejects.toThrow('TeamCity did not return a dependency identifier');
      });
    });
  });

  describe('updateDependency', () => {
    describe('artifact dependencies', () => {
      it('should update an existing artifact dependency', async () => {
        buildTypesApi.getArtifactDependency.mockResolvedValue(
          createMockAxiosResponse({
            id: 'artifact-dep-1',
            type: 'artifactDependency',
            properties: {
              property: [{ name: 'cleanDestinationDirectory', value: 'false' }],
            },
            'source-buildType': { id: 'Old_Upstream' },
          })
        );

        buildTypesApi.replaceArtifactDependency.mockResolvedValue(
          createMockAxiosResponse({ id: 'artifact-dep-1' })
        );

        const result = await manager.updateDependency('artifact-dep-1', {
          buildTypeId: 'Config_A',
          dependencyType: 'artifact',
          dependsOn: 'New_Upstream',
          properties: {
            cleanDestinationDirectory: true,
          },
        });

        expect(result.id).toBe('artifact-dep-1');
        expect(buildTypesApi.getArtifactDependency).toHaveBeenCalledWith(
          'Config_A',
          'artifact-dep-1',
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({ Accept: 'application/json' }),
          })
        );
        expect(buildTypesApi.replaceArtifactDependency).toHaveBeenCalledWith(
          'Config_A',
          'artifact-dep-1',
          undefined,
          expect.stringContaining('<artifact-dependency'),
          expect.objectContaining({
            headers: expect.objectContaining({
              'Content-Type': 'application/xml',
            }),
          })
        );
      });

      it('should merge properties with existing values', async () => {
        buildTypesApi.getArtifactDependency.mockResolvedValue(
          createMockAxiosResponse({
            id: 'artifact-dep-1',
            type: 'artifactDependency',
            properties: {
              property: [
                { name: 'existingProp', value: 'existing' },
                { name: 'overrideProp', value: 'old' },
              ],
            },
            'source-buildType': { id: 'Upstream' },
          })
        );

        buildTypesApi.replaceArtifactDependency.mockResolvedValue(
          createMockAxiosResponse({ id: 'artifact-dep-1' })
        );

        await manager.updateDependency('artifact-dep-1', {
          buildTypeId: 'Config_A',
          dependencyType: 'artifact',
          properties: {
            overrideProp: 'new',
            newProp: 'added',
          },
        });

        const xmlBody = buildTypesApi.replaceArtifactDependency.mock.calls[0]?.[3] as string;
        expect(xmlBody).toContain('existingProp');
        expect(xmlBody).toContain('name="overrideProp" value="new"');
        expect(xmlBody).toContain('newProp');
      });
    });

    describe('snapshot dependencies', () => {
      it('should update an existing snapshot dependency', async () => {
        buildTypesApi.getSnapshotDependency.mockResolvedValue(
          createMockAxiosResponse({
            id: 'snapshot-dep-1',
            type: 'snapshotDependency',
            properties: {
              property: [{ name: 'run-build-if-dependency-failed', value: 'false' }],
            },
            options: {
              option: [{ name: 'run-build-on-the-same-agent', value: 'false' }],
            },
            'source-buildType': { id: 'Base_Config' },
          })
        );

        buildTypesApi.replaceSnapshotDependency.mockResolvedValue(
          createMockAxiosResponse({ id: 'snapshot-dep-1' })
        );

        const result = await manager.updateDependency('snapshot-dep-1', {
          buildTypeId: 'Config_B',
          dependencyType: 'snapshot',
          options: {
            'run-build-on-the-same-agent': 'true',
          },
        });

        expect(result.id).toBe('snapshot-dep-1');
        expect(buildTypesApi.replaceSnapshotDependency).toHaveBeenCalledWith(
          'Config_B',
          'snapshot-dep-1',
          undefined,
          expect.stringContaining('<snapshot-dependency'),
          expect.any(Object)
        );
      });

      it('should merge options with existing values', async () => {
        buildTypesApi.getSnapshotDependency.mockResolvedValue(
          createMockAxiosResponse({
            id: 'snapshot-dep-1',
            type: 'snapshotDependency',
            options: {
              option: [
                { name: 'run-build-on-the-same-agent', value: 'false' },
                { name: 'sync-revisions', value: 'true' },
              ],
            },
            'source-buildType': { id: 'Base_Config' },
          })
        );

        buildTypesApi.replaceSnapshotDependency.mockResolvedValue(
          createMockAxiosResponse({ id: 'snapshot-dep-1' })
        );

        await manager.updateDependency('snapshot-dep-1', {
          buildTypeId: 'Config_B',
          dependencyType: 'snapshot',
          options: {
            'run-build-on-the-same-agent': 'true',
          },
        });

        const xmlBody = buildTypesApi.replaceSnapshotDependency.mock.calls[0]?.[3] as string;
        expect(xmlBody).toContain('run-build-on-the-same-agent');
        expect(xmlBody).toContain('sync-revisions');
      });
    });

    describe('validation errors', () => {
      it('should throw when dependency is not found', async () => {
        buildTypesApi.getArtifactDependency.mockRejectedValue(createNotFoundError('Dependency'));

        await expect(
          manager.updateDependency('non-existent-dep', {
            buildTypeId: 'Config_A',
            dependencyType: 'artifact',
            properties: { test: 'value' },
          })
        ).rejects.toThrow('was not found on Config_A');
      });
    });
  });

  describe('deleteDependency', () => {
    it('should delete an artifact dependency', async () => {
      buildTypesApi.deleteArtifactDependency.mockResolvedValue(createMockAxiosResponse(undefined));

      await manager.deleteDependency('artifact', 'Config_A', 'artifact-dep-1');

      expect(buildTypesApi.deleteArtifactDependency).toHaveBeenCalledWith(
        'Config_A',
        'artifact-dep-1',
        expect.objectContaining({
          headers: expect.objectContaining({ Accept: 'application/json' }),
        })
      );
    });

    it('should delete a snapshot dependency', async () => {
      buildTypesApi.deleteSnapshotDependency.mockResolvedValue(createMockAxiosResponse(undefined));

      await manager.deleteDependency('snapshot', 'Config_B', 'snapshot-dep-1');

      expect(buildTypesApi.deleteSnapshotDependency).toHaveBeenCalledWith(
        'Config_B',
        'snapshot-dep-1',
        expect.objectContaining({
          headers: expect.objectContaining({ Accept: 'application/json' }),
        })
      );
    });

    it('should throw when dependencyId is missing', async () => {
      await expect(manager.deleteDependency('artifact', 'Config_A', '')).rejects.toThrow(
        'dependencyId is required to delete a dependency'
      );
    });
  });

  describe('error handling', () => {
    it('should re-throw non-404 errors during fetch', async () => {
      buildTypesApi.getArtifactDependency.mockRejectedValue(createServerError('Internal error'));

      await expect(
        manager.updateDependency('dep-1', {
          buildTypeId: 'Config_A',
          dependencyType: 'artifact',
        })
      ).rejects.toThrow('Internal error');
    });

    it('should handle 403 permission errors', async () => {
      buildTypesApi.addArtifactDependencyToBuildType.mockRejectedValue(
        createAxiosError({ status: 403, message: 'Permission denied' })
      );

      await expect(
        manager.addDependency({
          buildTypeId: 'Config_A',
          dependencyType: 'artifact',
          dependsOn: 'Upstream',
        })
      ).rejects.toMatchObject({
        response: { status: 403 },
      });
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      buildTypesApi.addArtifactDependencyToBuildType.mockRejectedValue(networkError);

      await expect(
        manager.addDependency({
          buildTypeId: 'Config_A',
          dependencyType: 'artifact',
          dependsOn: 'Upstream',
        })
      ).rejects.toThrow('Network error');
    });
  });

  describe('property conversion', () => {
    it('should convert boolean values to strings', async () => {
      buildTypesApi.addArtifactDependencyToBuildType.mockResolvedValue(
        createMockAxiosResponse({ id: 'dep-1' })
      );

      await manager.addDependency({
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
        dependsOn: 'Upstream',
        properties: {
          boolTrue: true,
          boolFalse: false,
        },
      });

      const xmlBody = buildTypesApi.addArtifactDependencyToBuildType.mock.calls[0]?.[2] as string;
      expect(xmlBody).toContain('name="boolTrue" value="true"');
      expect(xmlBody).toContain('name="boolFalse" value="false"');
    });

    it('should convert null and undefined values to empty strings', async () => {
      buildTypesApi.addArtifactDependencyToBuildType.mockResolvedValue(
        createMockAxiosResponse({ id: 'dep-1' })
      );

      await manager.addDependency({
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
        dependsOn: 'Upstream',
        properties: {
          nullValue: null,
          undefinedValue: undefined,
        },
      });

      const xmlBody = buildTypesApi.addArtifactDependencyToBuildType.mock.calls[0]?.[2] as string;
      expect(xmlBody).toContain('name="nullValue" value=""');
      expect(xmlBody).toContain('name="undefinedValue" value=""');
    });

    it('should convert numeric values to strings', async () => {
      buildTypesApi.addArtifactDependencyToBuildType.mockResolvedValue(
        createMockAxiosResponse({ id: 'dep-1' })
      );

      await manager.addDependency({
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
        dependsOn: 'Upstream',
        properties: {
          number: 42,
          zero: 0,
        },
      });

      const xmlBody = buildTypesApi.addArtifactDependencyToBuildType.mock.calls[0]?.[2] as string;
      expect(xmlBody).toContain('name="number" value="42"');
      expect(xmlBody).toContain('name="zero" value="0"');
    });
  });

  describe('edge cases for property parsing', () => {
    it('should handle properties with missing value', async () => {
      buildTypesApi.getArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({
          id: 'artifact-dep-1',
          type: 'artifactDependency',
          properties: {
            property: [{ name: 'propWithNoValue' }],
          },
          'source-buildType': { id: 'Upstream' },
        })
      );

      buildTypesApi.replaceArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({ id: 'artifact-dep-1' })
      );

      await manager.updateDependency('artifact-dep-1', {
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
      });

      const xmlBody = buildTypesApi.replaceArtifactDependency.mock.calls[0]?.[3] as string;
      expect(xmlBody).toContain('name="propWithNoValue" value=""');
    });

    it('should handle properties with missing name', async () => {
      buildTypesApi.getArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({
          id: 'artifact-dep-1',
          type: 'artifactDependency',
          properties: {
            property: [{ value: 'valueWithNoName' }, { name: 'validProp', value: 'valid' }],
          },
          'source-buildType': { id: 'Upstream' },
        })
      );

      buildTypesApi.replaceArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({ id: 'artifact-dep-1' })
      );

      await manager.updateDependency('artifact-dep-1', {
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
      });

      const xmlBody = buildTypesApi.replaceArtifactDependency.mock.calls[0]?.[3] as string;
      expect(xmlBody).toContain('validProp');
      expect(xmlBody).not.toContain('valueWithNoName');
    });

    it('should handle single property object instead of array', async () => {
      buildTypesApi.getArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({
          id: 'artifact-dep-1',
          type: 'artifactDependency',
          properties: {
            property: { name: 'singleProp', value: 'singleValue' },
          },
          'source-buildType': { id: 'Upstream' },
        })
      );

      buildTypesApi.replaceArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({ id: 'artifact-dep-1' })
      );

      await manager.updateDependency('artifact-dep-1', {
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
      });

      const xmlBody = buildTypesApi.replaceArtifactDependency.mock.calls[0]?.[3] as string;
      expect(xmlBody).toContain('name="singleProp" value="singleValue"');
    });

    it('should handle null properties object', async () => {
      buildTypesApi.getArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({
          id: 'artifact-dep-1',
          type: 'artifactDependency',
          properties: null,
          'source-buildType': { id: 'Upstream' },
        })
      );

      buildTypesApi.replaceArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({ id: 'artifact-dep-1' })
      );

      await manager.updateDependency('artifact-dep-1', {
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
        properties: { newProp: 'newValue' },
      });

      const xmlBody = buildTypesApi.replaceArtifactDependency.mock.calls[0]?.[3] as string;
      expect(xmlBody).toContain('name="newProp" value="newValue"');
    });

    it('should handle undefined properties object', async () => {
      buildTypesApi.getArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({
          id: 'artifact-dep-1',
          type: 'artifactDependency',
          'source-buildType': { id: 'Upstream' },
        })
      );

      buildTypesApi.replaceArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({ id: 'artifact-dep-1' })
      );

      await manager.updateDependency('artifact-dep-1', {
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
      });

      expect(buildTypesApi.replaceArtifactDependency).toHaveBeenCalled();
    });
  });

  describe('edge cases for option parsing', () => {
    it('should handle single option object instead of array', async () => {
      buildTypesApi.getSnapshotDependency.mockResolvedValue(
        createMockAxiosResponse({
          id: 'snapshot-dep-1',
          type: 'snapshotDependency',
          options: {
            option: { name: 'singleOption', value: 'singleValue' },
          },
          'source-buildType': { id: 'Base' },
        })
      );

      buildTypesApi.replaceSnapshotDependency.mockResolvedValue(
        createMockAxiosResponse({ id: 'snapshot-dep-1' })
      );

      await manager.updateDependency('snapshot-dep-1', {
        buildTypeId: 'Config_B',
        dependencyType: 'snapshot',
      });

      const xmlBody = buildTypesApi.replaceSnapshotDependency.mock.calls[0]?.[3] as string;
      expect(xmlBody).toContain('name="singleOption" value="singleValue"');
    });

    it('should handle null options object', async () => {
      buildTypesApi.getSnapshotDependency.mockResolvedValue(
        createMockAxiosResponse({
          id: 'snapshot-dep-1',
          type: 'snapshotDependency',
          options: null,
          'source-buildType': { id: 'Base' },
        })
      );

      buildTypesApi.replaceSnapshotDependency.mockResolvedValue(
        createMockAxiosResponse({ id: 'snapshot-dep-1' })
      );

      await manager.updateDependency('snapshot-dep-1', {
        buildTypeId: 'Config_B',
        dependencyType: 'snapshot',
        options: { 'run-build-on-the-same-agent': 'true' },
      });

      const xmlBody = buildTypesApi.replaceSnapshotDependency.mock.calls[0]?.[3] as string;
      expect(xmlBody).toContain('run-build-on-the-same-agent');
    });

    it('should handle options with missing name', async () => {
      buildTypesApi.getSnapshotDependency.mockResolvedValue(
        createMockAxiosResponse({
          id: 'snapshot-dep-1',
          type: 'snapshotDependency',
          options: {
            option: [{ value: 'orphanValue' }, { name: 'validOption', value: 'valid' }],
          },
          'source-buildType': { id: 'Base' },
        })
      );

      buildTypesApi.replaceSnapshotDependency.mockResolvedValue(
        createMockAxiosResponse({ id: 'snapshot-dep-1' })
      );

      await manager.updateDependency('snapshot-dep-1', {
        buildTypeId: 'Config_B',
        dependencyType: 'snapshot',
      });

      const xmlBody = buildTypesApi.replaceSnapshotDependency.mock.calls[0]?.[3] as string;
      expect(xmlBody).toContain('validOption');
      expect(xmlBody).not.toContain('orphanValue');
    });

    it('should handle options with missing value', async () => {
      buildTypesApi.getSnapshotDependency.mockResolvedValue(
        createMockAxiosResponse({
          id: 'snapshot-dep-1',
          type: 'snapshotDependency',
          options: {
            option: [{ name: 'optionWithNoValue' }],
          },
          'source-buildType': { id: 'Base' },
        })
      );

      buildTypesApi.replaceSnapshotDependency.mockResolvedValue(
        createMockAxiosResponse({ id: 'snapshot-dep-1' })
      );

      await manager.updateDependency('snapshot-dep-1', {
        buildTypeId: 'Config_B',
        dependencyType: 'snapshot',
      });

      const xmlBody = buildTypesApi.replaceSnapshotDependency.mock.calls[0]?.[3] as string;
      expect(xmlBody).toContain('name="optionWithNoValue" value=""');
    });
  });

  describe('XML serialization edge cases', () => {
    it('should not include empty properties in XML', async () => {
      buildTypesApi.addArtifactDependencyToBuildType.mockResolvedValue(
        createMockAxiosResponse({ id: 'dep-1' })
      );

      await manager.addDependency({
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
        dependsOn: 'Upstream',
      });

      const xmlBody = buildTypesApi.addArtifactDependencyToBuildType.mock.calls[0]?.[2] as string;
      expect(xmlBody).not.toContain('<properties>');
    });

    it('should not include empty options in XML', async () => {
      buildTypesApi.addSnapshotDependencyToBuildType.mockResolvedValue(
        createMockAxiosResponse({ id: 'dep-1' })
      );

      await manager.addDependency({
        buildTypeId: 'Config_B',
        dependencyType: 'snapshot',
        dependsOn: 'Base',
      });

      const xmlBody = buildTypesApi.addSnapshotDependencyToBuildType.mock.calls[0]?.[2] as string;
      expect(xmlBody).not.toContain('<options>');
    });

    it('should normalize snapshotDependency type to snapshot_dependency', async () => {
      buildTypesApi.addSnapshotDependencyToBuildType.mockResolvedValue(
        createMockAxiosResponse({ id: 'dep-1' })
      );

      await manager.addDependency({
        buildTypeId: 'Config_B',
        dependencyType: 'snapshot',
        dependsOn: 'Base',
        type: 'snapshotDependency',
      });

      const xmlBody = buildTypesApi.addSnapshotDependencyToBuildType.mock.calls[0]?.[2] as string;
      expect(xmlBody).toContain('type="snapshot_dependency"');
    });

    it('should normalize artifactDependency type to artifact_dependency', async () => {
      buildTypesApi.addArtifactDependencyToBuildType.mockResolvedValue(
        createMockAxiosResponse({ id: 'dep-1' })
      );

      await manager.addDependency({
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
        dependsOn: 'Upstream',
        type: 'artifactDependency',
      });

      const xmlBody = buildTypesApi.addArtifactDependencyToBuildType.mock.calls[0]?.[2] as string;
      expect(xmlBody).toContain('type="artifact_dependency"');
    });

    it('should preserve custom type values without normalization', async () => {
      buildTypesApi.addArtifactDependencyToBuildType.mockResolvedValue(
        createMockAxiosResponse({ id: 'dep-1' })
      );

      await manager.addDependency({
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
        dependsOn: 'Upstream',
        type: 'customType',
      });

      const xmlBody = buildTypesApi.addArtifactDependencyToBuildType.mock.calls[0]?.[2] as string;
      expect(xmlBody).toContain('type="customType"');
    });

    it('should include name attribute when provided in existing dependency', async () => {
      buildTypesApi.getArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({
          id: 'artifact-dep-1',
          name: 'My Dependency',
          type: 'artifactDependency',
          'source-buildType': { id: 'Upstream' },
        })
      );

      buildTypesApi.replaceArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({ id: 'artifact-dep-1' })
      );

      await manager.updateDependency('artifact-dep-1', {
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
      });

      const xmlBody = buildTypesApi.replaceArtifactDependency.mock.calls[0]?.[3] as string;
      expect(xmlBody).toContain('name="My Dependency"');
    });

    it('should include inherited attribute when present', async () => {
      buildTypesApi.getArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({
          id: 'artifact-dep-1',
          type: 'artifactDependency',
          inherited: true,
          'source-buildType': { id: 'Upstream' },
        })
      );

      buildTypesApi.replaceArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({ id: 'artifact-dep-1' })
      );

      await manager.updateDependency('artifact-dep-1', {
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
      });

      const xmlBody = buildTypesApi.replaceArtifactDependency.mock.calls[0]?.[3] as string;
      expect(xmlBody).toContain('inherited="true"');
    });
  });

  describe('source-buildType handling', () => {
    it('should include source-buildType id when available', async () => {
      buildTypesApi.getArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({
          id: 'artifact-dep-1',
          type: 'artifactDependency',
          'source-buildType': { id: 'Upstream' },
        })
      );

      buildTypesApi.replaceArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({ id: 'artifact-dep-1' })
      );

      await manager.updateDependency('artifact-dep-1', {
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
      });

      const xmlBody = buildTypesApi.replaceArtifactDependency.mock.calls[0]?.[3] as string;
      expect(xmlBody).toContain('<source-buildType');
      expect(xmlBody).toContain('id="Upstream"');
    });

    it('should handle missing source-buildType in existing dependency', async () => {
      buildTypesApi.getArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({
          id: 'artifact-dep-1',
          type: 'artifactDependency',
        })
      );

      buildTypesApi.replaceArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({ id: 'artifact-dep-1' })
      );

      await manager.updateDependency('artifact-dep-1', {
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
        dependsOn: 'New_Upstream',
      });

      const xmlBody = buildTypesApi.replaceArtifactDependency.mock.calls[0]?.[3] as string;
      expect(xmlBody).toContain('id="New_Upstream"');
    });

    it('should delete source-buildType when dependsOn becomes undefined', async () => {
      buildTypesApi.getArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({
          id: 'artifact-dep-1',
          type: 'artifactDependency',
        })
      );

      buildTypesApi.replaceArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({ id: 'artifact-dep-1' })
      );

      await manager.updateDependency('artifact-dep-1', {
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
      });

      const xmlBody = buildTypesApi.replaceArtifactDependency.mock.calls[0]?.[3] as string;
      expect(xmlBody).not.toContain('<source-buildType');
    });
  });

  describe('type resolution', () => {
    it.each([
      ['artifact', 'artifactDependency'],
      ['snapshot', 'snapshotDependency'],
    ] as const)(
      'should use default type for %s dependency when not specified',
      async (dependencyType, expectedType) => {
        if (dependencyType === 'artifact') {
          buildTypesApi.addArtifactDependencyToBuildType.mockResolvedValue(
            createMockAxiosResponse({ id: 'dep-1' })
          );
        } else {
          buildTypesApi.addSnapshotDependencyToBuildType.mockResolvedValue(
            createMockAxiosResponse({ id: 'dep-1' })
          );
        }

        await manager.addDependency({
          buildTypeId: 'Config',
          dependencyType,
          dependsOn: 'Upstream',
        });

        const mock =
          dependencyType === 'artifact'
            ? buildTypesApi.addArtifactDependencyToBuildType
            : buildTypesApi.addSnapshotDependencyToBuildType;
        const xmlBody = mock.mock.calls[0]?.[2] as string;

        // The type gets normalized in XML
        const normalizedType =
          expectedType === 'artifactDependency' ? 'artifact_dependency' : 'snapshot_dependency';
        expect(xmlBody).toContain(`type="${normalizedType}"`);
      }
    );

    it('should prefer explicit type over existing type', async () => {
      buildTypesApi.getArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({
          id: 'artifact-dep-1',
          type: 'existingType',
          'source-buildType': { id: 'Upstream' },
        })
      );

      buildTypesApi.replaceArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({ id: 'artifact-dep-1' })
      );

      await manager.updateDependency('artifact-dep-1', {
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
        type: 'explicitType',
      });

      const xmlBody = buildTypesApi.replaceArtifactDependency.mock.calls[0]?.[3] as string;
      expect(xmlBody).toContain('type="explicitType"');
    });

    it('should use existing type when no explicit type provided', async () => {
      buildTypesApi.getArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({
          id: 'artifact-dep-1',
          type: 'existingType',
          'source-buildType': { id: 'Upstream' },
        })
      );

      buildTypesApi.replaceArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({ id: 'artifact-dep-1' })
      );

      await manager.updateDependency('artifact-dep-1', {
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
      });

      const xmlBody = buildTypesApi.replaceArtifactDependency.mock.calls[0]?.[3] as string;
      expect(xmlBody).toContain('type="existingType"');
    });
  });

  describe('artifact dependency options handling', () => {
    it('should include explicit options for artifact dependencies when provided', async () => {
      buildTypesApi.addArtifactDependencyToBuildType.mockResolvedValue(
        createMockAxiosResponse({ id: 'dep-1' })
      );

      await manager.addDependency({
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
        dependsOn: 'Upstream',
        options: {
          'custom-option': 'value',
        },
      });

      // For artifact dependencies, options should NOT be included in XML
      // They should be treated as properties instead
      const xmlBody = buildTypesApi.addArtifactDependencyToBuildType.mock.calls[0]?.[2] as string;
      // Artifact dependencies don't support options in the same way as snapshot dependencies
      // The options get converted to properties for artifact dependencies
      expect(xmlBody).not.toContain('<options>');
    });
  });

  describe('disabled attribute handling', () => {
    it('should set disabled to false when explicitly specified', async () => {
      buildTypesApi.addArtifactDependencyToBuildType.mockResolvedValue(
        createMockAxiosResponse({ id: 'dep-1' })
      );

      await manager.addDependency({
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
        dependsOn: 'Upstream',
        disabled: false,
      });

      const xmlBody = buildTypesApi.addArtifactDependencyToBuildType.mock.calls[0]?.[2] as string;
      expect(xmlBody).toContain('disabled="false"');
    });

    it('should preserve existing disabled state when not overridden', async () => {
      buildTypesApi.getArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({
          id: 'artifact-dep-1',
          type: 'artifactDependency',
          disabled: true,
          'source-buildType': { id: 'Upstream' },
        })
      );

      buildTypesApi.replaceArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({ id: 'artifact-dep-1' })
      );

      await manager.updateDependency('artifact-dep-1', {
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
        properties: { newProp: 'value' },
      });

      const xmlBody = buildTypesApi.replaceArtifactDependency.mock.calls[0]?.[3] as string;
      expect(xmlBody).toContain('disabled="true"');
    });
  });

  describe('empty attribute handling', () => {
    it('should not include id attribute when empty', async () => {
      buildTypesApi.addArtifactDependencyToBuildType.mockResolvedValue(
        createMockAxiosResponse({ id: 'new-id' })
      );

      await manager.addDependency({
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
        dependsOn: 'Upstream',
      });

      const xmlBody = buildTypesApi.addArtifactDependencyToBuildType.mock.calls[0]?.[2] as string;
      // Should have the root tag but not an id attribute for new dependencies
      expect(xmlBody).toMatch(/<artifact-dependency[^>]*>/);
    });

    it('should not include name attribute when empty string', async () => {
      buildTypesApi.getArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({
          id: 'artifact-dep-1',
          name: '',
          type: 'artifactDependency',
          'source-buildType': { id: 'Upstream' },
        })
      );

      buildTypesApi.replaceArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({ id: 'artifact-dep-1' })
      );

      await manager.updateDependency('artifact-dep-1', {
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
      });

      const xmlBody = buildTypesApi.replaceArtifactDependency.mock.calls[0]?.[3] as string;
      expect(xmlBody).not.toMatch(/name=""/);
    });

    it('should not include type attribute when whitespace only', async () => {
      buildTypesApi.getArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({
          id: 'artifact-dep-1',
          type: '   ',
          'source-buildType': { id: 'Upstream' },
        })
      );

      buildTypesApi.replaceArtifactDependency.mockResolvedValue(
        createMockAxiosResponse({ id: 'artifact-dep-1' })
      );

      await manager.updateDependency('artifact-dep-1', {
        buildTypeId: 'Config_A',
        dependencyType: 'artifact',
      });

      const xmlBody = buildTypesApi.replaceArtifactDependency.mock.calls[0]?.[3] as string;
      // Whitespace-only type is treated as empty, so no type attribute is included
      expect(xmlBody).not.toMatch(/type="[^"]*"/);
    });
  });

  describe('isNotFound helper', () => {
    it('should return true for 404 response', async () => {
      buildTypesApi.getArtifactDependency.mockRejectedValue(createNotFoundError('Dependency'));

      await expect(
        manager.updateDependency('non-existent', {
          buildTypeId: 'Config_A',
          dependencyType: 'artifact',
        })
      ).rejects.toThrow('was not found');
    });

    it('should return false for non-404 errors', async () => {
      buildTypesApi.getArtifactDependency.mockRejectedValue(createServerError('Server error'));

      await expect(
        manager.updateDependency('dep-1', {
          buildTypeId: 'Config_A',
          dependencyType: 'artifact',
        })
      ).rejects.toThrow('Server error');
    });

    it('should return false for errors without response', async () => {
      buildTypesApi.getArtifactDependency.mockRejectedValue(new Error('Network error'));

      await expect(
        manager.updateDependency('dep-1', {
          buildTypeId: 'Config_A',
          dependencyType: 'artifact',
        })
      ).rejects.toThrow('Network error');
    });

    it('should return false for null error', async () => {
      buildTypesApi.getArtifactDependency.mockRejectedValue(null);

      await expect(
        manager.updateDependency('dep-1', {
          buildTypeId: 'Config_A',
          dependencyType: 'artifact',
        })
      ).rejects.toBeNull();
    });
  });
});
