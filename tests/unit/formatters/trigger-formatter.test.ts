/**
 * Tests for trigger formatter
 */
import { describe, it, expect } from '@jest/globals';

import { formatTrigger, formatTriggerList } from '@/formatters/trigger-formatter';
import type { BuildTrigger } from '@/teamcity/build-trigger-manager';

describe('Trigger Formatter', () => {
  describe('formatTrigger', () => {
    it('should format VCS trigger', () => {
      const trigger: BuildTrigger = {
        id: 'vcs_trigger_1',
        type: 'vcsTrigger',
        enabled: true,
        properties: {
          branchFilter: '+:refs/heads/*',
          triggerRules: '+:src/**',
          quietPeriodMode: 'USE_DEFAULT',
          quietPeriod: '60',
          enableQueueOptimization: 'true',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('📌 Trigger: vcs_trigger_1');
      expect(result).toContain('Type: 🔄 VCS Trigger');
      expect(result).toContain('Status: ✅ Enabled');
      expect(result).toContain('Branch Filter: +:refs/heads/*');
      expect(result).toContain('Path Rules: +:src/**');
      expect(result).toContain('Quiet Period: USE_DEFAULT');
      expect(result).toContain('Quiet Period Value: 60s');
      expect(result).toContain('Queue Optimization: true');
    });

    it('should format disabled trigger', () => {
      const trigger: BuildTrigger = {
        id: 'disabled_trigger',
        type: 'vcsTrigger',
        enabled: false,
        properties: {},
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('Status: ❌ Disabled');
    });

    it('should format schedule trigger with daily schedule', () => {
      const trigger: BuildTrigger = {
        id: 'schedule_1',
        type: 'schedulingTrigger',
        enabled: true,
        properties: {
          schedulingPolicy: 'daily',
          timezone: 'UTC',
          triggerBuildWithPendingChangesOnly: 'true',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('📌 Trigger: schedule_1');
      expect(result).toContain('Type: ⏰ Schedule Trigger');
      expect(result).toContain('Status: ✅ Enabled');
      expect(result).toContain('Schedule: Daily at midnight');
      expect(result).toContain('Timezone: UTC');
      expect(result).toContain('Only with pending changes: true');
    });

    it('should format schedule trigger with cron expression', () => {
      const trigger: BuildTrigger = {
        id: 'schedule_2',
        type: 'schedulingTrigger',
        enabled: true,
        properties: {
          schedulingPolicy: '0 0 14 * * *', // Daily at 2 PM
          timezone: 'America/New_York',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('Schedule: Daily at 2:00 PM');
      expect(result).toContain('Timezone: America/New_York');
    });

    it('should format schedule trigger with build parameters', () => {
      const trigger: BuildTrigger = {
        id: 'schedule_3',
        type: 'schedulingTrigger',
        enabled: true,
        properties: {
          schedulingPolicy: 'weekly',
          'buildParams.env': 'production',
          'buildParams.debug': 'false',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('Schedule: Weekly on Sunday at midnight');
      expect(result).toContain('Build Parameter: env = production');
      expect(result).toContain('Build Parameter: debug = false');
    });

    it('should format dependency trigger', () => {
      const trigger: BuildTrigger = {
        id: 'dep_trigger',
        type: 'buildDependencyTrigger',
        enabled: true,
        dependsOn: 'ProjectA_Build',
        afterSuccessfulBuildOnly: true,
        artifactRules: '*.jar => lib/',
        properties: {
          branchFilter: '+:master',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('📌 Trigger: dep_trigger');
      expect(result).toContain('Type: 🔗 Dependency Trigger');
      expect(result).toContain('Depends On: ProjectA_Build');
      expect(result).toContain('Only after successful: true');
      expect(result).toContain('Artifact Rules: *.jar => lib/');
      expect(result).toContain('Branch Filter: +:master');
    });

    it('should format dependency trigger with multiple dependencies', () => {
      const trigger: BuildTrigger = {
        id: 'multi_dep',
        type: 'buildDependencyTrigger',
        enabled: true,
        dependsOn: ['Build1', 'Build2', 'Build3'],
        properties: {},
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('Depends On: Build1, Build2, Build3');
    });

    it('should format dependency trigger with properties fallback', () => {
      const trigger: BuildTrigger = {
        id: 'dep_props',
        type: 'buildDependencyTrigger',
        enabled: true,
        properties: {
          dependsOn: 'BuildFromProps',
          afterSuccessfulBuildOnly: 'false',
          dependOnStartedBuild: 'true',
          promoteArtifacts: 'true',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('Depends On: BuildFromProps');
      expect(result).toContain('Only after successful: false');
      expect(result).toContain('Depend on started: true');
      expect(result).toContain('Promote artifacts: true');
    });

    it('should format unknown trigger type', () => {
      const trigger: BuildTrigger = {
        id: 'custom_trigger',
        type: 'customTriggerType' as any,
        enabled: true,
        properties: {
          customProp1: 'value1',
          customProp2: 'value2',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('Type: customTriggerType');
      expect(result).toContain('customProp1: value1');
      expect(result).toContain('customProp2: value2');
    });

    it('should handle empty properties gracefully', () => {
      const trigger: BuildTrigger = {
        id: 'empty_props',
        type: 'vcsTrigger',
        enabled: true,
        properties: {},
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('📌 Trigger: empty_props');
      expect(result).not.toContain('Properties:');
    });

    it('should skip empty property values', () => {
      const trigger: BuildTrigger = {
        id: 'partial_props',
        type: 'vcsTrigger',
        enabled: true,
        properties: {
          branchFilter: '',
          triggerRules: '+:docs/**',
          quietPeriodMode: '',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).not.toContain('Branch Filter:');
      expect(result).toContain('Path Rules: +:docs/**');
      expect(result).not.toContain('Quiet Period:');
    });
  });

  describe('formatTriggerList', () => {
    it('should format multiple triggers', () => {
      const triggers: BuildTrigger[] = [
        {
          id: 'vcs_1',
          type: 'vcsTrigger',
          enabled: true,
          properties: {},
        },
        {
          id: 'schedule_1',
          type: 'schedulingTrigger',
          enabled: false,
          properties: {
            schedulingPolicy: 'nightly',
          },
        },
      ];

      const result = formatTriggerList(triggers, 'MyConfig');

      expect(result).toContain('📋 Build Triggers for MyConfig (2 triggers):');
      expect(result).toContain('📌 Trigger: vcs_1');
      expect(result).toContain('📌 Trigger: schedule_1');
      expect(result).toContain('Type: 🔄 VCS Trigger');
      expect(result).toContain('Type: ⏰ Schedule Trigger');
      expect(result).toContain('Schedule: Nightly at 2 AM');
    });

    it('should handle single trigger correctly', () => {
      const triggers: BuildTrigger[] = [
        {
          id: 'single',
          type: 'vcsTrigger',
          enabled: true,
          properties: {},
        },
      ];

      const result = formatTriggerList(triggers, 'SingleConfig');

      expect(result).toContain('📋 Build Triggers for SingleConfig (1 trigger):');
      expect(result).not.toContain('triggers)'); // Should not pluralize
    });

    it('should handle empty trigger list', () => {
      const result = formatTriggerList([], 'EmptyConfig');

      expect(result).toBe('No build triggers found for configuration: EmptyConfig');
    });

    it('should add spacing between triggers', () => {
      const triggers: BuildTrigger[] = [
        {
          id: 'trigger1',
          type: 'vcsTrigger',
          enabled: true,
          properties: {},
        },
        {
          id: 'trigger2',
          type: 'schedulingTrigger',
          enabled: true,
          properties: {},
        },
      ];

      const result = formatTriggerList(triggers, 'Config');
      const lines = result.split('\n');

      // Find the empty line between triggers
      const trigger1Index = lines.findIndex((line) => line.includes('trigger1'));
      const trigger2Index = lines.findIndex((line) => line.includes('trigger2'));
      
      // There should be empty lines for spacing
      expect(trigger2Index).toBeGreaterThan(trigger1Index);
      expect(lines.filter((line) => line === '').length).toBeGreaterThan(0);
    });
  });

  describe('formatSchedule', () => {
    it('should format special keywords', () => {
      const trigger1: BuildTrigger = {
        id: 'hourly',
        type: 'schedulingTrigger',
        enabled: true,
        properties: { schedulingPolicy: 'hourly' },
      };

      const result1 = formatTrigger(trigger1);
      expect(result1).toContain('Schedule: Every hour');
    });

    it('should parse cron expressions for midnight', () => {
      const trigger: BuildTrigger = {
        id: 'midnight',
        type: 'schedulingTrigger',
        enabled: true,
        properties: { schedulingPolicy: '0 0 0 * * *' },
      };

      const result = formatTrigger(trigger);
      expect(result).toContain('Schedule: Daily at 12:00 AM');
    });

    it('should parse cron expressions for morning times', () => {
      const trigger: BuildTrigger = {
        id: 'morning',
        type: 'schedulingTrigger',
        enabled: true,
        properties: { schedulingPolicy: '0 0 9 * * *' },
      };

      const result = formatTrigger(trigger);
      expect(result).toContain('Schedule: Daily at 9:00 AM');
    });

    it('should parse cron expressions for evening times', () => {
      const trigger: BuildTrigger = {
        id: 'evening',
        type: 'schedulingTrigger',
        enabled: true,
        properties: { schedulingPolicy: '0 0 18 * * *' },
      };

      const result = formatTrigger(trigger);
      expect(result).toContain('Schedule: Daily at 6:00 PM');
    });

    it('should handle hourly cron expression', () => {
      const trigger: BuildTrigger = {
        id: 'hourly_cron',
        type: 'schedulingTrigger',
        enabled: true,
        properties: { schedulingPolicy: '0 0 * * * *' },
      };

      const result = formatTrigger(trigger);
      expect(result).toContain('Schedule: Every hour at :00');
    });

    it('should return unparseable schedules as-is', () => {
      const trigger: BuildTrigger = {
        id: 'complex',
        type: 'schedulingTrigger',
        enabled: true,
        properties: { schedulingPolicy: '*/15 * * * *' }, // Every 15 minutes
      };

      const result = formatTrigger(trigger);
      expect(result).toContain('Schedule: */15 * * * *');
    });
  });
});