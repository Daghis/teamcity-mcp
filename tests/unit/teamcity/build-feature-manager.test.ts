/**
 * Unit tests for BuildFeatureManager
 *
 * Targets 80%+ branch coverage by testing:
 * - Null coalescing fallback paths
 * - Optional chaining with missing nested properties
 * - Error handling (404 vs non-404 HTTP errors)
 * - Empty collections
 * - Ternary operator branches
 * - Single-object responses from API
 */
import type { Feature, Properties } from '@/teamcity-client/models';
import { BuildFeatureManager } from '@/teamcity/build-feature-manager';

import {
  createAxiosError,
  createNetworkError,
  createNotFoundError,
  createServerError,
} from '../../test-utils/errors';
import {
  type MockTeamCityClient,
  createMockAxiosResponse,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

describe('BuildFeatureManager', () => {
  let manager: BuildFeatureManager;
  let mockClient: MockTeamCityClient;
  let addBuildFeatureToBuildType: jest.Mock;
  let replaceBuildFeature: jest.Mock;
  let deleteFeatureOfBuildType: jest.Mock;
  let getBuildFeature: jest.Mock;

  beforeEach(() => {
    mockClient = createMockTeamCityClient();
    mockClient.resetAllMocks();

    // Create mock functions for feature-related API methods
    addBuildFeatureToBuildType = jest.fn();
    replaceBuildFeature = jest.fn();
    deleteFeatureOfBuildType = jest.fn();
    getBuildFeature = jest.fn();

    // Assign mocks to the client's modules
    Object.assign(mockClient.modules.buildTypes, {
      addBuildFeatureToBuildType,
      replaceBuildFeature,
      deleteFeatureOfBuildType,
      getBuildFeature,
    });

    manager = new BuildFeatureManager(mockClient);
  });

  describe('addFeature', () => {
    it('adds a build feature with type and properties', async () => {
      const createdFeature: Feature = {
        id: 'FEATURE_1',
        type: 'ssh-agent',
        disabled: false,
        properties: {
          property: [{ name: 'teamcitySshKey', value: 'my-key' }],
        },
      };

      addBuildFeatureToBuildType.mockResolvedValue(createMockAxiosResponse(createdFeature));

      const result = await manager.addFeature({
        buildTypeId: 'MyProject_Build',
        type: 'ssh-agent',
        properties: { teamcitySshKey: 'my-key' },
      });

      expect(result).toEqual({ id: 'FEATURE_1' });
      expect(addBuildFeatureToBuildType).toHaveBeenCalledWith(
        'MyProject_Build',
        undefined,
        expect.objectContaining({
          type: 'ssh-agent',
          properties: expect.objectContaining({
            property: expect.arrayContaining([
              expect.objectContaining({ name: 'teamcitySshKey', value: 'my-key' }),
            ]),
          }),
        }),
        expect.any(Object)
      );
    });

    it('adds a build feature with disabled flag', async () => {
      const createdFeature: Feature = {
        id: 'FEATURE_2',
        type: 'perfmon',
        disabled: true,
      };

      addBuildFeatureToBuildType.mockResolvedValue(createMockAxiosResponse(createdFeature));

      const result = await manager.addFeature({
        buildTypeId: 'MyProject_Build',
        type: 'perfmon',
        disabled: true,
      });

      expect(result).toEqual({ id: 'FEATURE_2' });
      expect(addBuildFeatureToBuildType).toHaveBeenCalledWith(
        'MyProject_Build',
        undefined,
        expect.objectContaining({
          type: 'perfmon',
          disabled: true,
        }),
        expect.any(Object)
      );
    });

    it('throws error when type is missing', async () => {
      await expect(
        manager.addFeature({
          buildTypeId: 'MyProject_Build',
        })
      ).rejects.toThrow('type is required when adding a build feature.');
    });

    it('throws error when type is empty string', async () => {
      await expect(
        manager.addFeature({
          buildTypeId: 'MyProject_Build',
          type: '',
        })
      ).rejects.toThrow('type is required when adding a build feature.');
    });

    it('throws error when type is whitespace only', async () => {
      await expect(
        manager.addFeature({
          buildTypeId: 'MyProject_Build',
          type: '   ',
        })
      ).rejects.toThrow('type is required when adding a build feature.');
    });

    it('throws error when API returns no feature id', async () => {
      addBuildFeatureToBuildType.mockResolvedValue(createMockAxiosResponse({}));

      await expect(
        manager.addFeature({
          buildTypeId: 'MyProject_Build',
          type: 'ssh-agent',
        })
      ).rejects.toThrow('TeamCity did not return a feature identifier.');
    });

    it('throws error when API returns undefined data', async () => {
      addBuildFeatureToBuildType.mockResolvedValue({ data: undefined });

      await expect(
        manager.addFeature({
          buildTypeId: 'MyProject_Build',
          type: 'ssh-agent',
        })
      ).rejects.toThrow('TeamCity did not return a feature identifier.');
    });

    it('adds a feature without properties (undefined properties)', async () => {
      const createdFeature: Feature = {
        id: 'FEATURE_3',
        type: 'perfmon',
      };

      addBuildFeatureToBuildType.mockResolvedValue(createMockAxiosResponse(createdFeature));

      const result = await manager.addFeature({
        buildTypeId: 'MyProject_Build',
        type: 'perfmon',
      });

      expect(result).toEqual({ id: 'FEATURE_3' });
    });

    it('handles properties with null values converting to empty string', async () => {
      const createdFeature: Feature = {
        id: 'FEATURE_4',
        type: 'custom',
      };

      addBuildFeatureToBuildType.mockResolvedValue(createMockAxiosResponse(createdFeature));

      await manager.addFeature({
        buildTypeId: 'MyProject_Build',
        type: 'custom',
        properties: { key1: null as unknown as string },
      });

      expect(addBuildFeatureToBuildType).toHaveBeenCalledWith(
        'MyProject_Build',
        undefined,
        expect.objectContaining({
          properties: expect.objectContaining({
            property: expect.arrayContaining([
              expect.objectContaining({ name: 'key1', value: '' }),
            ]),
          }),
        }),
        expect.any(Object)
      );
    });

    it('handles properties with undefined values converting to empty string', async () => {
      const createdFeature: Feature = {
        id: 'FEATURE_5',
        type: 'custom',
      };

      addBuildFeatureToBuildType.mockResolvedValue(createMockAxiosResponse(createdFeature));

      await manager.addFeature({
        buildTypeId: 'MyProject_Build',
        type: 'custom',
        properties: { key1: undefined as unknown as string },
      });

      expect(addBuildFeatureToBuildType).toHaveBeenCalledWith(
        'MyProject_Build',
        undefined,
        expect.objectContaining({
          properties: expect.objectContaining({
            property: expect.arrayContaining([
              expect.objectContaining({ name: 'key1', value: '' }),
            ]),
          }),
        }),
        expect.any(Object)
      );
    });

    it('handles properties with boolean true value converting to "true"', async () => {
      const createdFeature: Feature = {
        id: 'FEATURE_6',
        type: 'custom',
      };

      addBuildFeatureToBuildType.mockResolvedValue(createMockAxiosResponse(createdFeature));

      await manager.addFeature({
        buildTypeId: 'MyProject_Build',
        type: 'custom',
        properties: { enabled: true as unknown as string },
      });

      expect(addBuildFeatureToBuildType).toHaveBeenCalledWith(
        'MyProject_Build',
        undefined,
        expect.objectContaining({
          properties: expect.objectContaining({
            property: expect.arrayContaining([
              expect.objectContaining({ name: 'enabled', value: 'true' }),
            ]),
          }),
        }),
        expect.any(Object)
      );
    });

    it('handles properties with boolean false value converting to "false"', async () => {
      const createdFeature: Feature = {
        id: 'FEATURE_7',
        type: 'custom',
      };

      addBuildFeatureToBuildType.mockResolvedValue(createMockAxiosResponse(createdFeature));

      await manager.addFeature({
        buildTypeId: 'MyProject_Build',
        type: 'custom',
        properties: { enabled: false as unknown as string },
      });

      expect(addBuildFeatureToBuildType).toHaveBeenCalledWith(
        'MyProject_Build',
        undefined,
        expect.objectContaining({
          properties: expect.objectContaining({
            property: expect.arrayContaining([
              expect.objectContaining({ name: 'enabled', value: 'false' }),
            ]),
          }),
        }),
        expect.any(Object)
      );
    });

    it('handles properties with numeric value converting to string', async () => {
      const createdFeature: Feature = {
        id: 'FEATURE_8',
        type: 'custom',
      };

      addBuildFeatureToBuildType.mockResolvedValue(createMockAxiosResponse(createdFeature));

      await manager.addFeature({
        buildTypeId: 'MyProject_Build',
        type: 'custom',
        properties: { count: 42 as unknown as string },
      });

      expect(addBuildFeatureToBuildType).toHaveBeenCalledWith(
        'MyProject_Build',
        undefined,
        expect.objectContaining({
          properties: expect.objectContaining({
            property: expect.arrayContaining([
              expect.objectContaining({ name: 'count', value: '42' }),
            ]),
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('updateFeature', () => {
    it('updates an existing feature with new properties', async () => {
      const existingFeature: Feature = {
        id: 'FEATURE_1',
        type: 'ssh-agent',
        disabled: false,
        properties: {
          property: [{ name: 'teamcitySshKey', value: 'old-key' }],
        },
      };

      getBuildFeature.mockResolvedValue(createMockAxiosResponse(existingFeature));
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      const result = await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
        properties: { teamcitySshKey: 'new-key' },
      });

      expect(result).toEqual({ id: 'FEATURE_1' });
      expect(replaceBuildFeature).toHaveBeenCalledWith(
        'MyProject_Build',
        'FEATURE_1',
        undefined,
        expect.objectContaining({
          type: 'ssh-agent',
          properties: expect.objectContaining({
            property: expect.arrayContaining([
              expect.objectContaining({ name: 'teamcitySshKey', value: 'new-key' }),
            ]),
          }),
        }),
        expect.any(Object)
      );
    });

    it('updates feature disabled flag', async () => {
      const existingFeature: Feature = {
        id: 'FEATURE_1',
        type: 'perfmon',
        disabled: false,
      };

      getBuildFeature.mockResolvedValue(createMockAxiosResponse(existingFeature));
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
        disabled: true,
      });

      expect(replaceBuildFeature).toHaveBeenCalledWith(
        'MyProject_Build',
        'FEATURE_1',
        undefined,
        expect.objectContaining({
          disabled: true,
        }),
        expect.any(Object)
      );
    });

    it('throws error when feature is not found', async () => {
      getBuildFeature.mockRejectedValue(createNotFoundError('Feature', 'INVALID'));

      await expect(
        manager.updateFeature('INVALID', {
          buildTypeId: 'MyProject_Build',
        })
      ).rejects.toThrow(
        'Feature INVALID was not found on MyProject_Build; verify the feature ID or update via the TeamCity UI.'
      );
    });

    it('preserves existing type when input.type is not provided', async () => {
      const existingFeature: Feature = {
        id: 'FEATURE_1',
        type: 'ssh-agent',
      };

      getBuildFeature.mockResolvedValue(createMockAxiosResponse(existingFeature));
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
        disabled: true,
      });

      expect(replaceBuildFeature).toHaveBeenCalledWith(
        'MyProject_Build',
        'FEATURE_1',
        undefined,
        expect.objectContaining({
          type: 'ssh-agent',
        }),
        expect.any(Object)
      );
    });

    it('overrides existing type when input.type is provided', async () => {
      const existingFeature: Feature = {
        id: 'FEATURE_1',
        type: 'ssh-agent',
      };

      getBuildFeature.mockResolvedValue(createMockAxiosResponse(existingFeature));
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
        type: 'perfmon',
      });

      expect(replaceBuildFeature).toHaveBeenCalledWith(
        'MyProject_Build',
        'FEATURE_1',
        undefined,
        expect.objectContaining({
          type: 'perfmon',
        }),
        expect.any(Object)
      );
    });

    it('merges properties from existing feature with new properties', async () => {
      const existingFeature: Feature = {
        id: 'FEATURE_1',
        type: 'custom',
        properties: {
          property: [
            { name: 'key1', value: 'value1' },
            { name: 'key2', value: 'value2' },
          ],
        },
      };

      getBuildFeature.mockResolvedValue(createMockAxiosResponse(existingFeature));
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
        properties: { key2: 'updated', key3: 'new' },
      });

      expect(replaceBuildFeature).toHaveBeenCalledWith(
        'MyProject_Build',
        'FEATURE_1',
        undefined,
        expect.objectContaining({
          properties: expect.objectContaining({
            property: expect.arrayContaining([
              expect.objectContaining({ name: 'key1', value: 'value1' }),
              expect.objectContaining({ name: 'key2', value: 'updated' }),
              expect.objectContaining({ name: 'key3', value: 'new' }),
            ]),
          }),
        }),
        expect.any(Object)
      );
    });

    it('handles existing feature with undefined properties', async () => {
      const existingFeature: Feature = {
        id: 'FEATURE_1',
        type: 'perfmon',
      };

      getBuildFeature.mockResolvedValue(createMockAxiosResponse(existingFeature));
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
        properties: { key1: 'value1' },
      });

      expect(replaceBuildFeature).toHaveBeenCalledWith(
        'MyProject_Build',
        'FEATURE_1',
        undefined,
        expect.objectContaining({
          properties: expect.objectContaining({
            property: expect.arrayContaining([
              expect.objectContaining({ name: 'key1', value: 'value1' }),
            ]),
          }),
        }),
        expect.any(Object)
      );
    });

    it('handles existing feature with null properties', async () => {
      const existingFeature: Feature = {
        id: 'FEATURE_1',
        type: 'perfmon',
        properties: null as unknown as Properties,
      };

      getBuildFeature.mockResolvedValue(createMockAxiosResponse(existingFeature));
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
        properties: { key1: 'value1' },
      });

      expect(replaceBuildFeature).toHaveBeenCalledWith(
        'MyProject_Build',
        'FEATURE_1',
        undefined,
        expect.objectContaining({
          properties: expect.objectContaining({
            property: expect.arrayContaining([
              expect.objectContaining({ name: 'key1', value: 'value1' }),
            ]),
          }),
        }),
        expect.any(Object)
      );
    });

    it('uses existing disabled flag when input.disabled is not provided', async () => {
      const existingFeature: Feature = {
        id: 'FEATURE_1',
        type: 'perfmon',
        disabled: true,
      };

      getBuildFeature.mockResolvedValue(createMockAxiosResponse(existingFeature));
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
      });

      expect(replaceBuildFeature).toHaveBeenCalledWith(
        'MyProject_Build',
        'FEATURE_1',
        undefined,
        expect.objectContaining({
          disabled: true,
        }),
        expect.any(Object)
      );
    });

    it('handles update with no input properties resulting in no properties in payload', async () => {
      const existingFeature: Feature = {
        id: 'FEATURE_1',
        type: 'perfmon',
      };

      getBuildFeature.mockResolvedValue(createMockAxiosResponse(existingFeature));
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
      });

      // Since there are no properties in existing or input, payload should not have properties
      const callArgs = replaceBuildFeature.mock.calls[0];
      const payload = callArgs[3] as Feature;
      expect(payload.properties).toBeUndefined();
    });
  });

  describe('deleteFeature', () => {
    it('deletes a feature successfully', async () => {
      deleteFeatureOfBuildType.mockResolvedValue(createMockAxiosResponse({}));

      await manager.deleteFeature('MyProject_Build', 'FEATURE_1');

      expect(deleteFeatureOfBuildType).toHaveBeenCalledWith(
        'MyProject_Build',
        'FEATURE_1',
        expect.any(Object)
      );
    });

    it('propagates API errors', async () => {
      deleteFeatureOfBuildType.mockRejectedValue(createServerError('Internal error'));

      await expect(manager.deleteFeature('MyProject_Build', 'FEATURE_1')).rejects.toThrow(
        'Internal error'
      );
    });
  });

  describe('fetchFeature (private, tested via updateFeature)', () => {
    it('returns null for 404 errors', async () => {
      getBuildFeature.mockRejectedValue(createNotFoundError('Feature', 'INVALID'));

      await expect(
        manager.updateFeature('INVALID', {
          buildTypeId: 'MyProject_Build',
        })
      ).rejects.toThrow('Feature INVALID was not found');
    });

    it('rethrows non-404 HTTP errors (500)', async () => {
      getBuildFeature.mockRejectedValue(createServerError('Database error'));

      await expect(
        manager.updateFeature('FEATURE_1', {
          buildTypeId: 'MyProject_Build',
        })
      ).rejects.toThrow('Database error');
    });

    it('rethrows non-404 HTTP errors (403)', async () => {
      getBuildFeature.mockRejectedValue(createAxiosError({ status: 403, message: 'Forbidden' }));

      await expect(
        manager.updateFeature('FEATURE_1', {
          buildTypeId: 'MyProject_Build',
        })
      ).rejects.toThrow('Forbidden');
    });

    it('rethrows network errors', async () => {
      getBuildFeature.mockRejectedValue(createNetworkError('ECONNREFUSED'));

      await expect(
        manager.updateFeature('FEATURE_1', {
          buildTypeId: 'MyProject_Build',
        })
      ).rejects.toThrow('Network Error');
    });

    it('handles error object without response property', async () => {
      const error = new Error('Unexpected error');
      getBuildFeature.mockRejectedValue(error);

      await expect(
        manager.updateFeature('FEATURE_1', {
          buildTypeId: 'MyProject_Build',
        })
      ).rejects.toThrow('Unexpected error');
    });

    it('handles error that is null', async () => {
      getBuildFeature.mockRejectedValue(null);

      await expect(
        manager.updateFeature('FEATURE_1', {
          buildTypeId: 'MyProject_Build',
        })
      ).rejects.toBeNull();
    });

    it('handles error that is not an object', async () => {
      getBuildFeature.mockRejectedValue('string error');

      await expect(
        manager.updateFeature('FEATURE_1', {
          buildTypeId: 'MyProject_Build',
        })
      ).rejects.toBe('string error');
    });

    it('handles error with response but no status', async () => {
      const error = {
        response: {},
      };
      getBuildFeature.mockRejectedValue(error);

      await expect(
        manager.updateFeature('FEATURE_1', {
          buildTypeId: 'MyProject_Build',
        })
      ).rejects.toEqual(error);
    });
  });

  describe('propertiesToRecord edge cases', () => {
    it('handles single property object instead of array (TeamCity sometimes returns single objects)', async () => {
      const existingFeature: Feature = {
        id: 'FEATURE_1',
        type: 'custom',
        properties: {
          property: { name: 'singleKey', value: 'singleValue' } as unknown as Array<{
            name?: string;
            value?: string;
          }>,
        },
      };

      getBuildFeature.mockResolvedValue(createMockAxiosResponse(existingFeature));
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
        properties: { newKey: 'newValue' },
      });

      expect(replaceBuildFeature).toHaveBeenCalledWith(
        'MyProject_Build',
        'FEATURE_1',
        undefined,
        expect.objectContaining({
          properties: expect.objectContaining({
            property: expect.arrayContaining([
              expect.objectContaining({ name: 'singleKey', value: 'singleValue' }),
              expect.objectContaining({ name: 'newKey', value: 'newValue' }),
            ]),
          }),
        }),
        expect.any(Object)
      );
    });

    it('handles property with missing name (skips the property)', async () => {
      const existingFeature: Feature = {
        id: 'FEATURE_1',
        type: 'custom',
        properties: {
          property: [
            { name: 'validKey', value: 'value1' },
            { value: 'orphanValue' } as { name?: string; value?: string }, // missing name
            { name: '', value: 'emptyNameValue' }, // empty name (falsy)
          ],
        },
      };

      getBuildFeature.mockResolvedValue(createMockAxiosResponse(existingFeature));
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
      });

      // Only validKey should be preserved (missing name and empty name are skipped)
      const callArgs = replaceBuildFeature.mock.calls[0];
      const payload = callArgs[3] as Feature;
      expect(payload.properties?.property).toHaveLength(1);
      expect(payload.properties?.property?.[0]).toEqual({ name: 'validKey', value: 'value1' });
    });

    it('handles property with null value (converts to empty string)', async () => {
      const existingFeature: Feature = {
        id: 'FEATURE_1',
        type: 'custom',
        properties: {
          property: [{ name: 'key', value: null as unknown as string }],
        },
      };

      getBuildFeature.mockResolvedValue(createMockAxiosResponse(existingFeature));
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
      });

      const callArgs = replaceBuildFeature.mock.calls[0];
      const payload = callArgs[3] as Feature;
      expect(payload.properties?.property?.[0]).toEqual({ name: 'key', value: '' });
    });

    it('handles property with undefined value (converts to empty string)', async () => {
      const existingFeature: Feature = {
        id: 'FEATURE_1',
        type: 'custom',
        properties: {
          property: [{ name: 'key', value: undefined as unknown as string }],
        },
      };

      getBuildFeature.mockResolvedValue(createMockAxiosResponse(existingFeature));
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
      });

      const callArgs = replaceBuildFeature.mock.calls[0];
      const payload = callArgs[3] as Feature;
      expect(payload.properties?.property?.[0]).toEqual({ name: 'key', value: '' });
    });

    it('handles property array being null (treated as empty)', async () => {
      const existingFeature: Feature = {
        id: 'FEATURE_1',
        type: 'custom',
        properties: {
          property: null as unknown as Array<{ name?: string; value?: string }>,
        },
      };

      getBuildFeature.mockResolvedValue(createMockAxiosResponse(existingFeature));
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
        properties: { newKey: 'newValue' },
      });

      const callArgs = replaceBuildFeature.mock.calls[0];
      const payload = callArgs[3] as Feature;
      expect(payload.properties?.property).toEqual([{ name: 'newKey', value: 'newValue' }]);
    });

    it('handles property array being undefined (treated as empty)', async () => {
      const existingFeature: Feature = {
        id: 'FEATURE_1',
        type: 'custom',
        properties: {
          property: undefined as unknown as Array<{ name?: string; value?: string }>,
        },
      };

      getBuildFeature.mockResolvedValue(createMockAxiosResponse(existingFeature));
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
        properties: { newKey: 'newValue' },
      });

      const callArgs = replaceBuildFeature.mock.calls[0];
      const payload = callArgs[3] as Feature;
      expect(payload.properties?.property).toEqual([{ name: 'newKey', value: 'newValue' }]);
    });
  });

  describe('buildPayload edge cases', () => {
    it('uses undefined disabled when neither input nor existing have it', async () => {
      const existingFeature: Feature = {
        id: 'FEATURE_1',
        type: 'perfmon',
      };

      getBuildFeature.mockResolvedValue(createMockAxiosResponse(existingFeature));
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
      });

      const callArgs = replaceBuildFeature.mock.calls[0];
      const payload = callArgs[3] as Feature;
      expect(payload.disabled).toBeUndefined();
    });

    it('handles existing feature without type (edge case)', async () => {
      const existingFeature: Feature = {
        id: 'FEATURE_1',
      };

      getBuildFeature.mockResolvedValue(createMockAxiosResponse(existingFeature));
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
        type: 'newType',
      });

      const callArgs = replaceBuildFeature.mock.calls[0];
      const payload = callArgs[3] as Feature;
      expect(payload.type).toBe('newType');
    });

    it('does not add properties to payload when merged properties are empty', async () => {
      const existingFeature: Feature = {
        id: 'FEATURE_1',
        type: 'perfmon',
      };

      getBuildFeature.mockResolvedValue(createMockAxiosResponse(existingFeature));
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
        properties: {},
      });

      const callArgs = replaceBuildFeature.mock.calls[0];
      const payload = callArgs[3] as Feature;
      expect(payload.properties).toBeUndefined();
    });
  });

  describe('toStringRecord edge cases', () => {
    describe.each([
      ['undefined input', undefined, {}],
      ['empty object', {}, {}],
      ['null value', { key: null }, { key: '' }],
      ['undefined value', { key: undefined }, { key: '' }],
      ['boolean true', { key: true }, { key: 'true' }],
      ['boolean false', { key: false }, { key: 'false' }],
      ['number', { key: 123 }, { key: '123' }],
      ['zero', { key: 0 }, { key: '0' }],
      ['string', { key: 'value' }, { key: 'value' }],
      ['empty string', { key: '' }, { key: '' }],
      ['object value', { key: { nested: true } }, { key: '[object Object]' }],
      ['array value', { key: [1, 2, 3] }, { key: '1,2,3' }],
    ] as const)(
      'converts %s correctly',
      (
        _description: string,
        input: Record<string, unknown> | undefined,
        expected: Record<string, string>
      ) => {
        it(`should handle ${_description}`, async () => {
          const createdFeature: Feature = { id: 'F1', type: 'custom' };
          addBuildFeatureToBuildType.mockResolvedValue(createMockAxiosResponse(createdFeature));

          await manager.addFeature({
            buildTypeId: 'MyProject_Build',
            type: 'custom',
            properties: input,
          });

          const callArgs = addBuildFeatureToBuildType.mock.calls[0];
          const payload = callArgs[2] as Feature;

          if (Object.keys(expected).length === 0) {
            // No properties should be set when input is empty/undefined
            expect(payload.properties).toBeUndefined();
          } else {
            expect(payload.properties?.property).toEqual(
              Object.entries(expected).map(([name, value]) => ({ name, value }))
            );
          }
        });
      }
    );
  });

  describe('API header configuration', () => {
    it('uses correct headers for add operation', async () => {
      const createdFeature: Feature = { id: 'FEATURE_1', type: 'custom' };
      addBuildFeatureToBuildType.mockResolvedValue(createMockAxiosResponse(createdFeature));

      await manager.addFeature({
        buildTypeId: 'MyProject_Build',
        type: 'custom',
      });

      expect(addBuildFeatureToBuildType).toHaveBeenCalledWith(
        'MyProject_Build',
        undefined,
        expect.any(Object),
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }
      );
    });

    it('uses correct headers for get operation', async () => {
      getBuildFeature.mockResolvedValue(
        createMockAxiosResponse({ id: 'FEATURE_1', type: 'custom' })
      );
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
      });

      expect(getBuildFeature).toHaveBeenCalledWith(
        'MyProject_Build',
        'FEATURE_1',
        'id,type,disabled,properties(property(name,value))',
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );
    });

    it('uses correct headers for replace operation', async () => {
      getBuildFeature.mockResolvedValue(
        createMockAxiosResponse({ id: 'FEATURE_1', type: 'custom' })
      );
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
      });

      expect(replaceBuildFeature).toHaveBeenCalledWith(
        'MyProject_Build',
        'FEATURE_1',
        undefined,
        expect.any(Object),
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }
      );
    });

    it('uses correct headers for delete operation', async () => {
      deleteFeatureOfBuildType.mockResolvedValue(createMockAxiosResponse({}));

      await manager.deleteFeature('MyProject_Build', 'FEATURE_1');

      expect(deleteFeatureOfBuildType).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
    });
  });

  describe('existing property spreads to payload correctly', () => {
    it('spreads existing feature properties to payload', async () => {
      const existingFeature: Feature = {
        id: 'FEATURE_1',
        type: 'custom',
        disabled: false,
        href: '/some/href',
        inherited: true,
      };

      getBuildFeature.mockResolvedValue(createMockAxiosResponse(existingFeature));
      replaceBuildFeature.mockResolvedValue(createMockAxiosResponse({ id: 'FEATURE_1' }));

      await manager.updateFeature('FEATURE_1', {
        buildTypeId: 'MyProject_Build',
      });

      const callArgs = replaceBuildFeature.mock.calls[0];
      const payload = callArgs[3] as Feature;
      // Existing properties should be spread into payload
      expect(payload.id).toBe('FEATURE_1');
      expect(payload.href).toBe('/some/href');
      expect(payload.inherited).toBe(true);
    });

    it('handles undefined existing feature (addFeature case)', async () => {
      const createdFeature: Feature = { id: 'FEATURE_1', type: 'custom' };
      addBuildFeatureToBuildType.mockResolvedValue(createMockAxiosResponse(createdFeature));

      await manager.addFeature({
        buildTypeId: 'MyProject_Build',
        type: 'custom',
        disabled: true,
      });

      // When existing is undefined, payload should still work
      const callArgs = addBuildFeatureToBuildType.mock.calls[0];
      const payload = callArgs[2] as Feature;
      expect(payload.type).toBe('custom');
      expect(payload.disabled).toBe(true);
    });
  });
});
