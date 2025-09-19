import {
  isTeamCityTriggerResponse,
  isTeamCityTriggersResponse,
  isTeamCityVcsRootEntriesResponse,
} from '@/teamcity/api-types';

describe('TeamCity API type guards', () => {
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

    it('rejects payloads without a string type', () => {
      expect(
        isTeamCityTriggerResponse({
          id: 'TRIGGER_2',
          type: 123,
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

    it('rejects collections containing invalid triggers', () => {
      const payload = {
        trigger: [{ id: 'TRIGGER_2', type: null }],
      };

      expect(isTeamCityTriggersResponse(payload)).toBe(false);
    });
  });

  describe('isTeamCityVcsRootEntriesResponse', () => {
    it('accepts valid VCS root entries payload', () => {
      const payload = {
        count: 1,
        'vcs-root-entry': [
          {
            id: 'ENTRY_1',
            'vcs-root': { id: 'VCS_ROOT' },
          },
        ],
      };

      expect(isTeamCityVcsRootEntriesResponse(payload)).toBe(true);
    });

    it('rejects payloads with malformed entries', () => {
      const payload = {
        'vcs-root-entry': [{ id: 'ENTRY_2', 'vcs-root': { id: 42 } }],
      };

      expect(isTeamCityVcsRootEntriesResponse(payload)).toBe(false);
    });
  });
});
