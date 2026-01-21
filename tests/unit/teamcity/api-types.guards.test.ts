import {
  type TeamCityBuildTypeResponse,
  type TeamCityProperty,
  type TeamCityStepResponse,
  type TeamCityTriggerResponse,
  type TeamCityVcsRootEntry,
  isBuildTypeArray,
  isPropertyArray,
  isStepArray,
  isTeamCityErrorResponse,
  isTeamCityProperties,
  isTeamCityProperty,
  isTeamCityTriggerResponse,
  isTeamCityTriggersResponse,
  isTeamCityVcsRootEntriesResponse,
  isTeamCityVcsRootEntry,
  isTriggerArray,
  isVcsRootEntryArray,
  normalizeBuildTypes,
  normalizeProperties,
  normalizeSteps,
  normalizeTriggers,
  normalizeVcsRootEntries,
  propertiesToRecord,
} from '@/teamcity/api-types';

describe('TeamCity API type guards', () => {
  describe('isTeamCityErrorResponse', () => {
    it('returns true for objects with message property', () => {
      expect(isTeamCityErrorResponse({ message: 'Error occurred' })).toBe(true);
    });

    it('returns true for objects with message and details', () => {
      expect(isTeamCityErrorResponse({ message: 'Error', details: 'More info' })).toBe(true);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['string', 'error'],
      ['number', 123],
      ['array', []],
      ['object without message', { details: 'info' }],
      ['empty object', {}],
    ])('returns false for %s', (_, value) => {
      expect(isTeamCityErrorResponse(value)).toBe(false);
    });
  });

  describe('isTeamCityProperty', () => {
    it('accepts minimal valid property with name and value', () => {
      expect(isTeamCityProperty({ name: 'key', value: 'val' })).toBe(true);
    });

    it('accepts property with inherited boolean', () => {
      expect(isTeamCityProperty({ name: 'key', value: 'val', inherited: true })).toBe(true);
      expect(isTeamCityProperty({ name: 'key', value: 'val', inherited: false })).toBe(true);
    });

    it('accepts property with type object', () => {
      expect(isTeamCityProperty({ name: 'key', value: 'val', type: {} })).toBe(true);
      expect(isTeamCityProperty({ name: 'key', value: 'val', type: { rawValue: 'text' } })).toBe(
        true
      );
    });

    it('accepts property with all optional fields', () => {
      expect(
        isTeamCityProperty({
          name: 'key',
          value: 'val',
          inherited: true,
          type: { rawValue: 'password' },
        })
      ).toBe(true);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['string', 'property'],
      ['number', 42],
      ['array', []],
    ])('returns false for non-object: %s', (_, value) => {
      expect(isTeamCityProperty(value)).toBe(false);
    });

    it.each([
      ['missing name', { value: 'val' }],
      ['missing value', { name: 'key' }],
      ['empty object', {}],
    ])('returns false when %s', (_, value) => {
      expect(isTeamCityProperty(value)).toBe(false);
    });

    it.each([
      ['number name', { name: 123, value: 'val' }],
      ['boolean name', { name: true, value: 'val' }],
      ['object name', { name: {}, value: 'val' }],
      ['array name', { name: [], value: 'val' }],
      ['null name', { name: null, value: 'val' }],
    ])('returns false for non-string name: %s', (_, value) => {
      expect(isTeamCityProperty(value)).toBe(false);
    });

    it.each([
      ['number value', { name: 'key', value: 123 }],
      ['boolean value', { name: 'key', value: false }],
      ['object value', { name: 'key', value: {} }],
      ['array value', { name: 'key', value: [] }],
      ['null value', { name: 'key', value: null }],
    ])('returns false for non-string value: %s', (_, value) => {
      expect(isTeamCityProperty(value)).toBe(false);
    });

    it.each([
      ['string inherited', { name: 'key', value: 'val', inherited: 'true' }],
      ['number inherited', { name: 'key', value: 'val', inherited: 1 }],
      ['object inherited', { name: 'key', value: 'val', inherited: {} }],
    ])('returns false for non-boolean inherited: %s', (_, value) => {
      expect(isTeamCityProperty(value)).toBe(false);
    });

    it.each([
      ['string type', { name: 'key', value: 'val', type: 'text' }],
      ['number type', { name: 'key', value: 'val', type: 42 }],
      ['null type', { name: 'key', value: 'val', type: null }],
    ])('returns false for non-object type: %s', (_, value) => {
      expect(isTeamCityProperty(value)).toBe(false);
    });

    // Note: Arrays pass isRecord since typeof [] === 'object'
    it('accepts array type since it passes isRecord check', () => {
      expect(isTeamCityProperty({ name: 'key', value: 'val', type: [] })).toBe(true);
    });
  });

  describe('isTeamCityProperties', () => {
    it('accepts empty properties object', () => {
      expect(isTeamCityProperties({})).toBe(true);
    });

    it('accepts properties with only count', () => {
      expect(isTeamCityProperties({ count: 0 })).toBe(true);
      expect(isTeamCityProperties({ count: 5 })).toBe(true);
    });

    it('accepts properties with undefined property field', () => {
      expect(isTeamCityProperties({ count: 0, property: undefined })).toBe(true);
    });

    it('accepts properties with single property object', () => {
      expect(isTeamCityProperties({ property: { name: 'key', value: 'val' } })).toBe(true);
    });

    it('accepts properties with property array', () => {
      expect(
        isTeamCityProperties({
          count: 2,
          property: [
            { name: 'key1', value: 'val1' },
            { name: 'key2', value: 'val2' },
          ],
        })
      ).toBe(true);
    });

    it('accepts properties with empty array', () => {
      expect(isTeamCityProperties({ count: 0, property: [] })).toBe(true);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['string', 'properties'],
      ['number', 123],
    ])('returns false for non-object: %s', (_, value) => {
      expect(isTeamCityProperties(value)).toBe(false);
    });

    // Note: Empty arrays pass isRecord and are valid TeamCityProperties
    it('accepts empty array since it passes isRecord check', () => {
      expect(isTeamCityProperties([])).toBe(true);
    });

    it.each([
      ['string count', { count: '5' }],
      ['boolean count', { count: true }],
      ['object count', { count: {} }],
      ['null count', { count: null }],
    ])('returns false for non-number count: %s', (_, value) => {
      expect(isTeamCityProperties(value)).toBe(false);
    });

    it('returns false when property array contains invalid items', () => {
      expect(
        isTeamCityProperties({
          property: [
            { name: 'valid', value: 'prop' },
            { name: 123, value: 'invalid' },
          ],
        })
      ).toBe(false);
    });

    it('returns false when single property is invalid', () => {
      expect(isTeamCityProperties({ property: { name: 'key' } })).toBe(false);
    });
  });

  describe('isTeamCityTriggerResponse', () => {
    it('accepts valid trigger payloads', () => {
      const payload = {
        id: 'TRIGGER_1',
        type: 'vcsTrigger',
        disabled: false,
        properties: {
          property: [{ name: 'branchFilter', value: '+:refs/heads/main' }],
        },
      };

      expect(isTeamCityTriggerResponse(payload)).toBe(true);
    });

    it('accepts minimal trigger with just id and type', () => {
      expect(isTeamCityTriggerResponse({ id: 'T1', type: 'vcsTrigger' })).toBe(true);
    });

    it('accepts trigger with inherited flag', () => {
      expect(isTeamCityTriggerResponse({ id: 'T1', type: 'vcsTrigger', inherited: true })).toBe(
        true
      );
      expect(isTeamCityTriggerResponse({ id: 'T1', type: 'vcsTrigger', inherited: false })).toBe(
        true
      );
    });

    it('accepts trigger with disabled flag', () => {
      expect(isTeamCityTriggerResponse({ id: 'T1', type: 'vcsTrigger', disabled: true })).toBe(
        true
      );
      expect(isTeamCityTriggerResponse({ id: 'T1', type: 'vcsTrigger', disabled: false })).toBe(
        true
      );
    });

    it('accepts trigger with all optional fields', () => {
      expect(
        isTeamCityTriggerResponse({
          id: 'T1',
          type: 'schedulingTrigger',
          disabled: true,
          inherited: false,
          properties: { count: 1, property: { name: 'cronExpression', value: '0 0 * * *' } },
        })
      ).toBe(true);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['string', 'trigger'],
      ['number', 42],
      ['array', []],
    ])('returns false for non-object: %s', (_, value) => {
      expect(isTeamCityTriggerResponse(value)).toBe(false);
    });

    it('rejects payloads without a string type', () => {
      expect(
        isTeamCityTriggerResponse({
          id: 'TRIGGER_2',
          type: 123,
        })
      ).toBe(false);
    });

    it.each([
      ['number id', { id: 123, type: 'vcsTrigger' }],
      ['boolean id', { id: true, type: 'vcsTrigger' }],
      ['object id', { id: {}, type: 'vcsTrigger' }],
      ['null id', { id: null, type: 'vcsTrigger' }],
    ])('returns false for non-string id: %s', (_, value) => {
      expect(isTeamCityTriggerResponse(value)).toBe(false);
    });

    it.each([
      ['undefined type', { id: 'T1', type: undefined }],
      ['number type', { id: 'T1', type: 123 }],
      ['boolean type', { id: 'T1', type: true }],
      ['object type', { id: 'T1', type: {} }],
      ['null type', { id: 'T1', type: null }],
    ])('returns false for non-string type: %s', (_, value) => {
      expect(isTeamCityTriggerResponse(value)).toBe(false);
    });

    it.each([
      ['string disabled', { id: 'T1', type: 'vcsTrigger', disabled: 'true' }],
      ['number disabled', { id: 'T1', type: 'vcsTrigger', disabled: 1 }],
      ['object disabled', { id: 'T1', type: 'vcsTrigger', disabled: {} }],
    ])('returns false for non-boolean disabled: %s', (_, value) => {
      expect(isTeamCityTriggerResponse(value)).toBe(false);
    });

    it.each([
      ['string inherited', { id: 'T1', type: 'vcsTrigger', inherited: 'false' }],
      ['number inherited', { id: 'T1', type: 'vcsTrigger', inherited: 0 }],
      ['object inherited', { id: 'T1', type: 'vcsTrigger', inherited: {} }],
    ])('returns false for non-boolean inherited: %s', (_, value) => {
      expect(isTeamCityTriggerResponse(value)).toBe(false);
    });

    it('returns false when properties is invalid', () => {
      expect(
        isTeamCityTriggerResponse({
          id: 'T1',
          type: 'vcsTrigger',
          properties: { count: 'invalid' },
        })
      ).toBe(false);
    });
  });

  describe('isTeamCityTriggersResponse', () => {
    it('accepts collections with valid triggers', () => {
      const payload = {
        count: 1,
        trigger: [
          {
            id: 'TRIGGER_1',
            type: 'schedulingTrigger',
            disabled: true,
          },
        ],
      };

      expect(isTeamCityTriggersResponse(payload)).toBe(true);
    });

    it('accepts empty triggers response', () => {
      expect(isTeamCityTriggersResponse({})).toBe(true);
    });

    it('accepts response with only count', () => {
      expect(isTeamCityTriggersResponse({ count: 0 })).toBe(true);
    });

    it('accepts response with undefined trigger', () => {
      expect(isTeamCityTriggersResponse({ count: 0, trigger: undefined })).toBe(true);
    });

    it('accepts response with single trigger object', () => {
      expect(
        isTeamCityTriggersResponse({
          count: 1,
          trigger: { id: 'T1', type: 'vcsTrigger' },
        })
      ).toBe(true);
    });

    it('accepts response with empty trigger array', () => {
      expect(isTeamCityTriggersResponse({ count: 0, trigger: [] })).toBe(true);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['string', 'triggers'],
      ['number', 42],
    ])('returns false for non-object: %s', (_, value) => {
      expect(isTeamCityTriggersResponse(value)).toBe(false);
    });

    // Note: Empty arrays pass isRecord since typeof [] === 'object'
    it('accepts empty array since it passes isRecord check', () => {
      expect(isTeamCityTriggersResponse([])).toBe(true);
    });

    it.each([
      ['string count', { count: '1' }],
      ['boolean count', { count: true }],
      ['object count', { count: {} }],
      ['null count', { count: null }],
    ])('returns false for non-number count: %s', (_, value) => {
      expect(isTeamCityTriggersResponse(value)).toBe(false);
    });

    it('rejects collections containing invalid triggers', () => {
      const payload = {
        trigger: [{ id: 'TRIGGER_2', type: null }],
      };

      expect(isTeamCityTriggersResponse(payload)).toBe(false);
    });

    it('returns false when single trigger is invalid', () => {
      expect(
        isTeamCityTriggersResponse({
          trigger: { id: 123, type: 'vcsTrigger' },
        })
      ).toBe(false);
    });
  });

  describe('isTeamCityVcsRootEntry', () => {
    it('accepts valid VCS root entry', () => {
      expect(
        isTeamCityVcsRootEntry({
          id: 'ENTRY_1',
          'vcs-root': { id: 'VCS_ROOT', name: 'My Repo' },
        })
      ).toBe(true);
    });

    it('accepts entry with minimal vcs-root', () => {
      expect(
        isTeamCityVcsRootEntry({
          id: 'E1',
          'vcs-root': { id: 'VR1', name: 'repo' },
        })
      ).toBe(true);
    });

    it('accepts entry without vcs-root (undefined)', () => {
      expect(isTeamCityVcsRootEntry({ id: 'E1' })).toBe(true);
    });

    it('accepts entry with inherited flag', () => {
      expect(
        isTeamCityVcsRootEntry({
          id: 'E1',
          inherited: true,
          'vcs-root': { id: 'VR1', name: 'repo' },
        })
      ).toBe(true);
      expect(
        isTeamCityVcsRootEntry({
          id: 'E1',
          inherited: false,
          'vcs-root': { id: 'VR1', name: 'repo' },
        })
      ).toBe(true);
    });

    it('accepts entry with checkout-rules', () => {
      expect(
        isTeamCityVcsRootEntry({
          id: 'E1',
          'checkout-rules': '+:src/**\n-:test/**',
          'vcs-root': { id: 'VR1', name: 'repo' },
        })
      ).toBe(true);
    });

    it('accepts entry with vcs-root containing properties', () => {
      expect(
        isTeamCityVcsRootEntry({
          id: 'E1',
          'vcs-root': {
            id: 'VR1',
            name: 'repo',
            properties: {
              count: 1,
              property: { name: 'url', value: 'https://github.com/test/repo' },
            },
          },
        })
      ).toBe(true);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['string', 'entry'],
      ['number', 42],
    ])('returns false for non-object: %s', (_, value) => {
      expect(isTeamCityVcsRootEntry(value)).toBe(false);
    });

    // Note: Empty arrays pass isRecord since typeof [] === 'object'
    it('accepts empty array since it passes isRecord check', () => {
      expect(isTeamCityVcsRootEntry([])).toBe(true);
    });

    it.each([
      ['number id', { id: 123, 'vcs-root': { id: 'VR1', name: 'repo' } }],
      ['boolean id', { id: true, 'vcs-root': { id: 'VR1', name: 'repo' } }],
      ['object id', { id: {}, 'vcs-root': { id: 'VR1', name: 'repo' } }],
      ['null id', { id: null, 'vcs-root': { id: 'VR1', name: 'repo' } }],
    ])('returns false for non-string id: %s', (_, value) => {
      expect(isTeamCityVcsRootEntry(value)).toBe(false);
    });

    it.each([
      ['string inherited', { id: 'E1', inherited: 'true' }],
      ['number inherited', { id: 'E1', inherited: 1 }],
      ['object inherited', { id: 'E1', inherited: {} }],
    ])('returns false for non-boolean inherited: %s', (_, value) => {
      expect(isTeamCityVcsRootEntry(value)).toBe(false);
    });

    it.each([
      ['number checkout-rules', { id: 'E1', 'checkout-rules': 123 }],
      ['boolean checkout-rules', { id: 'E1', 'checkout-rules': true }],
      ['object checkout-rules', { id: 'E1', 'checkout-rules': {} }],
    ])('returns false for non-string checkout-rules: %s', (_, value) => {
      expect(isTeamCityVcsRootEntry(value)).toBe(false);
    });

    it('returns false when vcs-root is not an object', () => {
      expect(isTeamCityVcsRootEntry({ id: 'E1', 'vcs-root': 'invalid' })).toBe(false);
      expect(isTeamCityVcsRootEntry({ id: 'E1', 'vcs-root': 123 })).toBe(false);
      expect(isTeamCityVcsRootEntry({ id: 'E1', 'vcs-root': null })).toBe(false);
    });

    it.each([
      ['number vcs-root.id', { id: 'E1', 'vcs-root': { id: 42, name: 'repo' } }],
      ['boolean vcs-root.id', { id: 'E1', 'vcs-root': { id: false, name: 'repo' } }],
      ['null vcs-root.id', { id: 'E1', 'vcs-root': { id: null, name: 'repo' } }],
    ])('returns false for non-string vcs-root.id: %s', (_, value) => {
      expect(isTeamCityVcsRootEntry(value)).toBe(false);
    });

    it.each([
      ['number vcs-root.name', { id: 'E1', 'vcs-root': { id: 'VR1', name: 123 } }],
      ['boolean vcs-root.name', { id: 'E1', 'vcs-root': { id: 'VR1', name: true } }],
      ['null vcs-root.name', { id: 'E1', 'vcs-root': { id: 'VR1', name: null } }],
    ])('returns false for non-string vcs-root.name: %s', (_, value) => {
      expect(isTeamCityVcsRootEntry(value)).toBe(false);
    });

    it('returns false when vcs-root.properties is invalid', () => {
      expect(
        isTeamCityVcsRootEntry({
          id: 'E1',
          'vcs-root': { id: 'VR1', name: 'repo', properties: { count: 'invalid' } },
        })
      ).toBe(false);
    });
  });

  describe('isTeamCityVcsRootEntriesResponse', () => {
    it('accepts valid VCS root entries payload', () => {
      const payload = {
        count: 1,
        'vcs-root-entry': [
          {
            id: 'ENTRY_1',
            'vcs-root': { id: 'VCS_ROOT', name: 'My Repo' },
          },
        ],
      };

      expect(isTeamCityVcsRootEntriesResponse(payload)).toBe(true);
    });

    it('accepts empty response', () => {
      expect(isTeamCityVcsRootEntriesResponse({})).toBe(true);
    });

    it('accepts response with only count', () => {
      expect(isTeamCityVcsRootEntriesResponse({ count: 0 })).toBe(true);
    });

    it('accepts response with undefined entries', () => {
      expect(isTeamCityVcsRootEntriesResponse({ count: 0, 'vcs-root-entry': undefined })).toBe(
        true
      );
    });

    it('accepts response with single entry object', () => {
      expect(
        isTeamCityVcsRootEntriesResponse({
          count: 1,
          'vcs-root-entry': { id: 'E1', 'vcs-root': { id: 'VR1', name: 'repo' } },
        })
      ).toBe(true);
    });

    it('accepts response with empty entries array', () => {
      expect(isTeamCityVcsRootEntriesResponse({ count: 0, 'vcs-root-entry': [] })).toBe(true);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['string', 'entries'],
      ['number', 42],
    ])('returns false for non-object: %s', (_, value) => {
      expect(isTeamCityVcsRootEntriesResponse(value)).toBe(false);
    });

    // Note: Empty arrays pass isRecord since typeof [] === 'object'
    it('accepts empty array since it passes isRecord check', () => {
      expect(isTeamCityVcsRootEntriesResponse([])).toBe(true);
    });

    it.each([
      ['string count', { count: '1' }],
      ['boolean count', { count: true }],
      ['object count', { count: {} }],
      ['null count', { count: null }],
    ])('returns false for non-number count: %s', (_, value) => {
      expect(isTeamCityVcsRootEntriesResponse(value)).toBe(false);
    });

    it('rejects payloads with malformed entries', () => {
      const payload = {
        'vcs-root-entry': [{ id: 'ENTRY_2', 'vcs-root': { id: 42, name: 'repo' } }],
      };

      expect(isTeamCityVcsRootEntriesResponse(payload)).toBe(false);
    });

    it('returns false when single entry is invalid', () => {
      expect(
        isTeamCityVcsRootEntriesResponse({
          'vcs-root-entry': { id: 123, 'vcs-root': { id: 'VR1', name: 'repo' } },
        })
      ).toBe(false);
    });
  });

  describe('Array type guards', () => {
    describe('isPropertyArray', () => {
      it('returns true for arrays', () => {
        expect(isPropertyArray([])).toBe(true);
        expect(isPropertyArray([{ name: 'key', value: 'val' }])).toBe(true);
      });

      it('returns false for non-arrays', () => {
        expect(isPropertyArray(undefined)).toBe(false);
        expect(isPropertyArray({ name: 'key', value: 'val' } as TeamCityProperty)).toBe(false);
      });
    });

    describe('isTriggerArray', () => {
      it('returns true for arrays', () => {
        expect(isTriggerArray([])).toBe(true);
        expect(isTriggerArray([{ id: 'T1', type: 'vcsTrigger' }])).toBe(true);
      });

      it('returns false for non-arrays', () => {
        expect(isTriggerArray(undefined)).toBe(false);
        expect(isTriggerArray({ id: 'T1', type: 'vcsTrigger' } as TeamCityTriggerResponse)).toBe(
          false
        );
      });
    });

    describe('isStepArray', () => {
      it('returns true for arrays', () => {
        expect(isStepArray([])).toBe(true);
        expect(isStepArray([{ id: 'S1', name: 'Build', type: 'simpleRunner' }])).toBe(true);
      });

      it('returns false for non-arrays', () => {
        expect(isStepArray(undefined)).toBe(false);
        expect(
          isStepArray({ id: 'S1', name: 'Build', type: 'simpleRunner' } as TeamCityStepResponse)
        ).toBe(false);
      });
    });

    describe('isBuildTypeArray', () => {
      it('returns true for arrays', () => {
        expect(isBuildTypeArray([])).toBe(true);
        expect(isBuildTypeArray([{ id: 'BT1', name: 'Build', projectId: 'Proj1' }])).toBe(true);
      });

      it('returns false for non-arrays', () => {
        expect(isBuildTypeArray(undefined)).toBe(false);
        expect(
          isBuildTypeArray({
            id: 'BT1',
            name: 'Build',
            projectId: 'Proj1',
          } as TeamCityBuildTypeResponse)
        ).toBe(false);
      });
    });

    describe('isVcsRootEntryArray', () => {
      it('returns true for arrays', () => {
        expect(isVcsRootEntryArray([])).toBe(true);
        expect(isVcsRootEntryArray([{ id: 'E1', 'vcs-root': { id: 'VR1', name: 'repo' } }])).toBe(
          true
        );
      });

      it('returns false for non-arrays', () => {
        expect(isVcsRootEntryArray(undefined)).toBe(false);
        expect(
          isVcsRootEntryArray({
            id: 'E1',
            'vcs-root': { id: 'VR1', name: 'repo' },
          } as TeamCityVcsRootEntry)
        ).toBe(false);
      });
    });
  });

  describe('Normalize functions', () => {
    describe('normalizeProperties', () => {
      it('returns empty array for undefined', () => {
        expect(normalizeProperties(undefined)).toEqual([]);
      });

      it('returns empty array for properties without property field', () => {
        expect(normalizeProperties({})).toEqual([]);
        expect(normalizeProperties({ count: 0 })).toEqual([]);
      });

      it('returns empty array for undefined property field', () => {
        expect(normalizeProperties({ property: undefined })).toEqual([]);
      });

      it('wraps single property in array', () => {
        const prop = { name: 'key', value: 'val' };
        expect(normalizeProperties({ property: prop })).toEqual([prop]);
      });

      it('returns array as-is', () => {
        const props = [
          { name: 'key1', value: 'val1' },
          { name: 'key2', value: 'val2' },
        ];
        expect(normalizeProperties({ property: props })).toEqual(props);
      });

      it('returns empty array for empty array', () => {
        expect(normalizeProperties({ property: [] })).toEqual([]);
      });
    });

    describe('normalizeTriggers', () => {
      it('returns empty array for undefined', () => {
        expect(normalizeTriggers(undefined)).toEqual([]);
      });

      it('returns empty array for response without trigger field', () => {
        expect(normalizeTriggers({})).toEqual([]);
        expect(normalizeTriggers({ count: 0 })).toEqual([]);
      });

      it('returns empty array for undefined trigger field', () => {
        expect(normalizeTriggers({ trigger: undefined })).toEqual([]);
      });

      it('wraps single trigger in array', () => {
        const trigger = { id: 'T1', type: 'vcsTrigger' };
        expect(normalizeTriggers({ trigger })).toEqual([trigger]);
      });

      it('returns array as-is', () => {
        const triggers = [
          { id: 'T1', type: 'vcsTrigger' },
          { id: 'T2', type: 'schedulingTrigger' },
        ];
        expect(normalizeTriggers({ trigger: triggers })).toEqual(triggers);
      });

      it('returns empty array for empty array', () => {
        expect(normalizeTriggers({ trigger: [] })).toEqual([]);
      });
    });

    describe('normalizeSteps', () => {
      it('returns empty array for undefined', () => {
        expect(normalizeSteps(undefined)).toEqual([]);
      });

      it('returns empty array for response without step field', () => {
        expect(normalizeSteps({})).toEqual([]);
        expect(normalizeSteps({ count: 0 })).toEqual([]);
      });

      it('returns empty array for undefined step field', () => {
        expect(normalizeSteps({ step: undefined })).toEqual([]);
      });

      it('wraps single step in array', () => {
        const step = { id: 'S1', name: 'Build', type: 'simpleRunner' };
        expect(normalizeSteps({ step })).toEqual([step]);
      });

      it('returns array as-is', () => {
        const steps = [
          { id: 'S1', name: 'Build', type: 'simpleRunner' },
          { id: 'S2', name: 'Test', type: 'simpleRunner' },
        ];
        expect(normalizeSteps({ step: steps })).toEqual(steps);
      });

      it('returns empty array for empty array', () => {
        expect(normalizeSteps({ step: [] })).toEqual([]);
      });
    });

    describe('normalizeBuildTypes', () => {
      it('returns empty array for undefined', () => {
        expect(normalizeBuildTypes(undefined)).toEqual([]);
      });

      it('returns empty array for response without buildType field', () => {
        expect(normalizeBuildTypes({})).toEqual([]);
        expect(normalizeBuildTypes({ count: 0 })).toEqual([]);
      });

      it('returns empty array for undefined buildType field', () => {
        expect(normalizeBuildTypes({ buildType: undefined })).toEqual([]);
      });

      it('wraps single buildType in array', () => {
        const buildType = { id: 'BT1', name: 'Build', projectId: 'Proj1' };
        expect(normalizeBuildTypes({ buildType })).toEqual([buildType]);
      });

      it('returns array as-is', () => {
        const buildTypes = [
          { id: 'BT1', name: 'Build', projectId: 'Proj1' },
          { id: 'BT2', name: 'Deploy', projectId: 'Proj1' },
        ];
        expect(normalizeBuildTypes({ buildType: buildTypes })).toEqual(buildTypes);
      });

      it('returns empty array for empty array', () => {
        expect(normalizeBuildTypes({ buildType: [] })).toEqual([]);
      });
    });

    describe('normalizeVcsRootEntries', () => {
      it('returns empty array for undefined', () => {
        expect(normalizeVcsRootEntries(undefined)).toEqual([]);
      });

      it('returns empty array for response without vcs-root-entry field', () => {
        expect(normalizeVcsRootEntries({})).toEqual([]);
        expect(normalizeVcsRootEntries({ count: 0 })).toEqual([]);
      });

      it('returns empty array for undefined vcs-root-entry field', () => {
        expect(normalizeVcsRootEntries({ 'vcs-root-entry': undefined })).toEqual([]);
      });

      it('wraps single entry in array', () => {
        const entry = { id: 'E1', 'vcs-root': { id: 'VR1', name: 'repo' } };
        expect(normalizeVcsRootEntries({ 'vcs-root-entry': entry })).toEqual([entry]);
      });

      it('returns array as-is', () => {
        const entries = [
          { id: 'E1', 'vcs-root': { id: 'VR1', name: 'repo1' } },
          { id: 'E2', 'vcs-root': { id: 'VR2', name: 'repo2' } },
        ];
        expect(normalizeVcsRootEntries({ 'vcs-root-entry': entries })).toEqual(entries);
      });

      it('returns empty array for empty array', () => {
        expect(normalizeVcsRootEntries({ 'vcs-root-entry': [] })).toEqual([]);
      });
    });
  });

  describe('propertiesToRecord', () => {
    it('returns empty object for empty array', () => {
      expect(propertiesToRecord([])).toEqual({});
    });

    it('converts single property to record', () => {
      expect(propertiesToRecord([{ name: 'key', value: 'val' }])).toEqual({ key: 'val' });
    });

    it('converts multiple properties to record', () => {
      const properties = [
        { name: 'key1', value: 'val1' },
        { name: 'key2', value: 'val2' },
        { name: 'key3', value: 'val3' },
      ];
      expect(propertiesToRecord(properties)).toEqual({
        key1: 'val1',
        key2: 'val2',
        key3: 'val3',
      });
    });

    it('later properties override earlier ones with same name', () => {
      const properties = [
        { name: 'key', value: 'first' },
        { name: 'key', value: 'second' },
      ];
      expect(propertiesToRecord(properties)).toEqual({ key: 'second' });
    });

    it('ignores inherited and type fields', () => {
      const properties = [
        { name: 'key', value: 'val', inherited: true, type: { rawValue: 'text' } },
      ];
      expect(propertiesToRecord(properties)).toEqual({ key: 'val' });
    });
  });
});
