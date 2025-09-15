import { formatTrigger, formatTriggerList } from '@/formatters/trigger-formatter';
import type { BuildTrigger } from '@/teamcity/build-trigger-manager';

describe('trigger-formatter', () => {
  describe('formatTrigger', () => {
    it('formats VCS trigger with all properties', () => {
      const trigger: BuildTrigger = {
        id: 'vcs-trigger-1',
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

      expect(result).toContain('📌 Trigger: vcs-trigger-1');
      expect(result).toContain('Type: 🔄 VCS Trigger');
      expect(result).toContain('Status: ✅ Enabled');
      expect(result).toContain('Branch Filter: +:refs/heads/*');
      expect(result).toContain('Path Rules: +:src/**');
      expect(result).toContain('Quiet Period: USE_DEFAULT');
      expect(result).toContain('Quiet Period Value: 60s');
      expect(result).toContain('Queue Optimization: true');
    });

    it('formats VCS trigger with minimal properties', () => {
      const trigger: BuildTrigger = {
        id: 'vcs-minimal',
        type: 'vcsTrigger',
        enabled: false,
        properties: {},
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('📌 Trigger: vcs-minimal');
      expect(result).toContain('Type: 🔄 VCS Trigger');
      expect(result).toContain('Status: ❌ Disabled');
      expect(result).not.toContain('Branch Filter:');
      expect(result).not.toContain('Path Rules:');
    });

    it('formats schedule trigger with cron expression', () => {
      const trigger: BuildTrigger = {
        id: 'schedule-1',
        type: 'schedulingTrigger',
        enabled: true,
        properties: {
          schedulingPolicy: 'cron { minutes=0 hours=2 }',
          timezone: 'America/New_York',
          triggerBuildWithPendingChangesOnly: 'true',
          promoteWatchedBuild: 'false',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('📌 Trigger: schedule-1');
      expect(result).toContain('Type: ⏰ Schedule Trigger');
      expect(result).toContain('Status: ✅ Enabled');
      expect(result).toContain('Schedule: cron { minutes=0 hours=2 }');
      expect(result).toContain('Timezone: America/New_York');
      expect(result).toContain('Only with pending changes: true');
      expect(result).toContain('Promote watched build: false');
    });

    it('formats schedule trigger with daily keyword', () => {
      const trigger: BuildTrigger = {
        id: 'daily-trigger',
        type: 'schedulingTrigger',
        enabled: true,
        properties: {
          schedulingPolicy: 'daily',
          timezone: 'UTC',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('Schedule: Daily at midnight');
      expect(result).toContain('Timezone: UTC');
    });

    it('formats schedule trigger with weekly keyword', () => {
      const trigger: BuildTrigger = {
        id: 'weekly-trigger',
        type: 'schedulingTrigger',
        enabled: true,
        properties: {
          schedulingPolicy: 'weekly',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('Schedule: Weekly on Sunday at midnight');
    });

    it('formats dependency trigger', () => {
      const trigger: BuildTrigger = {
        id: 'dep-trigger',
        type: 'buildDependencyTrigger',
        enabled: true,
        properties: {
          dependsOn: 'MyProject_Build',
          afterSuccessfulBuildOnly: 'true',
          branchFilter: '+:master',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('📌 Trigger: dep-trigger');
      expect(result).toContain('Type: 🔗 Dependency Trigger');
      expect(result).toContain('Status: ✅ Enabled');
      expect(result).toContain('Depends On: MyProject_Build');
      expect(result).toContain('Only after successful: true');
      expect(result).toContain('Branch Filter: +:master');
    });

    it('formats dependency trigger with build parameters', () => {
      const trigger: BuildTrigger = {
        id: 'dep-params',
        type: 'buildDependencyTrigger',
        enabled: true,
        properties: {
          dependsOn: 'ParentBuild',
          'parameter.env': 'production',
          'parameter.version': '%build.number%',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('Depends On: ParentBuild');
      expect(result).not.toContain('Build Parameters:');
      expect(result).not.toContain('env: production');
      expect(result).not.toContain('version: %build.number%');
    });

    it('formats unknown trigger type', () => {
      const trigger: BuildTrigger = {
        id: 'unknown-trigger',
        type: 'customTrigger' as any,
        enabled: true,
        properties: {
          customProp: 'value',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('Type: customTrigger');
      expect(result).toContain('customProp: value');
    });

    it('formats trigger without properties', () => {
      const trigger: BuildTrigger = {
        id: 'no-props',
        type: 'vcsTrigger',
        enabled: true,
        properties: {},
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('📌 Trigger: no-props');
      expect(result).not.toContain('Properties:');
    });
  });

  describe('formatTriggerList', () => {
    it('formats list of multiple triggers', () => {
      const triggers: BuildTrigger[] = [
        {
          id: 'vcs-1',
          type: 'vcsTrigger',
          enabled: true,
          properties: {
            branchFilter: '+:*',
          },
        },
        {
          id: 'schedule-1',
          type: 'schedulingTrigger',
          enabled: false,
          properties: {
            schedulingPolicy: 'daily',
          },
        },
      ];

      const result = formatTriggerList(triggers, 'MyConfig');

      expect(result).toContain('📋 Build Triggers for MyConfig (2 triggers):');
      expect(result).toContain('📌 Trigger: vcs-1');
      expect(result).toContain('📌 Trigger: schedule-1');
    });

    it('formats single trigger', () => {
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
      expect(result).not.toContain('triggers):'); // Singular form
    });

    it('formats empty trigger list', () => {
      const result = formatTriggerList([], 'EmptyConfig');

      expect(result).toBe('No build triggers found for configuration: EmptyConfig');
    });
  });

  describe('cron expression parsing', () => {
    it('parses standard cron expressions', () => {
      const trigger: BuildTrigger = {
        id: 'cron-test',
        type: 'schedulingTrigger',
        enabled: true,
        properties: {
          schedulingPolicy: 'cron { minutes=0 hours=*/6 }',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('Schedule: cron { minutes=0 hours=*/6 }');
    });

    it('parses daily cron at specific time', () => {
      const trigger: BuildTrigger = {
        id: 'daily-cron',
        type: 'schedulingTrigger',
        enabled: true,
        properties: {
          schedulingPolicy: 'cron { minutes=30 hours=14 }',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('Schedule: cron { minutes=30 hours=14 }');
    });

    it('parses weekly cron on specific days', () => {
      const trigger: BuildTrigger = {
        id: 'weekly-cron',
        type: 'schedulingTrigger',
        enabled: true,
        properties: {
          schedulingPolicy: 'cron { minutes=0 hours=9 dayOfWeek=MON,WED,FRI }',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('Schedule: cron { minutes=0 hours=9 dayOfWeek=MON,WED,FRI }');
    });

    it('parses monthly cron', () => {
      const trigger: BuildTrigger = {
        id: 'monthly-cron',
        type: 'schedulingTrigger',
        enabled: true,
        properties: {
          schedulingPolicy: 'cron { minutes=0 hours=0 dayOfMonth=1 }',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('Schedule: cron { minutes=0 hours=0 dayOfMonth=1 }');
    });

    it('handles invalid cron format', () => {
      const trigger: BuildTrigger = {
        id: 'invalid-cron',
        type: 'schedulingTrigger',
        enabled: true,
        properties: {
          schedulingPolicy: 'invalid cron',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('Schedule: invalid cron');
    });

    it('handles missing scheduling policy', () => {
      const trigger: BuildTrigger = {
        id: 'no-schedule',
        type: 'schedulingTrigger',
        enabled: true,
        properties: {},
      };

      const result = formatTrigger(trigger);

      expect(result).not.toContain('Schedule:');
    });
  });

  describe('edge cases', () => {
    it('handles properties with empty strings', () => {
      const trigger: BuildTrigger = {
        id: 'empty-props',
        type: 'vcsTrigger',
        enabled: true,
        properties: {
          branchFilter: '',
          triggerRules: '',
          quietPeriodMode: '',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).not.toContain('Branch Filter:');
      expect(result).not.toContain('Path Rules:');
      expect(result).not.toContain('Quiet Period:');
    });

    it('handles properties with undefined values', () => {
      const trigger: BuildTrigger = {
        id: 'undefined-props',
        type: 'vcsTrigger',
        enabled: true,
        properties: {
          branchFilter: undefined as any,
          triggerRules: undefined as any,
        },
      };

      const result = formatTrigger(trigger);

      expect(result).not.toContain('Branch Filter:');
      expect(result).not.toContain('Path Rules:');
    });

    it('formats complex cron with all fields', () => {
      const trigger: BuildTrigger = {
        id: 'complex-cron',
        type: 'schedulingTrigger',
        enabled: true,
        properties: {
          schedulingPolicy: 'cron { seconds=0 minutes=*/15 hours=9-17 dayOfMonth=* month=* dayOfWeek=MON-FRI }',
        },
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('Schedule:');
      expect(result).toContain('cron');
    });

    it('handles very long property values', () => {
      const trigger: BuildTrigger = {
        id: 'long-props',
        type: 'vcsTrigger',
        enabled: true,
        properties: {
          branchFilter: `+:${  'a/'.repeat(100)  }branch`,
          triggerRules: `+:${  'path/'.repeat(100)  }file.txt`,
        },
      };

      const result = formatTrigger(trigger);

      expect(result).toContain('Branch Filter:');
      expect(result).toContain('Path Rules:');
    });
  });
});