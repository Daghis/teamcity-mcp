/**
 * Formatter for TeamCity build triggers
 */
import type { BuildTrigger, TriggerType } from '@/teamcity/build-trigger-manager';

/**
 * Format a single trigger for display
 */
export function formatTrigger(trigger: BuildTrigger): string {
  const lines: string[] = [];

  lines.push(`📌 Trigger: ${trigger.id}`);
  lines.push(`   Type: ${formatTriggerType(trigger.type)}`);
  lines.push(`   Status: ${trigger.enabled ? '✅ Enabled' : '❌ Disabled'}`);

  // Format properties based on trigger type
  const propLines = formatTriggerProperties(trigger);
  if (propLines.length > 0) {
    lines.push('   Properties:');
    propLines.forEach((line) => lines.push(`     ${line}`));
  }

  return lines.join('\n');
}

/**
 * Format a list of triggers
 */
export function formatTriggerList(triggers: BuildTrigger[], configId: string): string {
  if (triggers.length === 0) {
    return `No build triggers found for configuration: ${configId}`;
  }

  const lines: string[] = [];
  lines.push(
    `📋 Build Triggers for ${configId} (${triggers.length} trigger${triggers.length !== 1 ? 's' : ''}):`
  );
  lines.push('');

  triggers.forEach((trigger, index) => {
    if (index > 0) {
      lines.push('');
    }
    lines.push(formatTrigger(trigger));
  });

  return lines.join('\n');
}

/**
 * Format trigger type for display
 */
function formatTriggerType(type: TriggerType): string {
  switch (type) {
    case 'vcsTrigger':
      return '🔄 VCS Trigger';
    case 'schedulingTrigger':
      return '⏰ Schedule Trigger';
    case 'buildDependencyTrigger':
      return '🔗 Dependency Trigger';
    default:
      return type;
  }
}

/**
 * Format trigger properties based on type
 */
function formatTriggerProperties(trigger: BuildTrigger): string[] {
  const lines: string[] = [];
  const props = trigger.properties;

  switch (trigger.type) {
    case 'vcsTrigger':
      if (props['branchFilter'] !== undefined && props['branchFilter'] !== '') {
        lines.push(`Branch Filter: ${props['branchFilter']}`);
      }
      if (props['triggerRules'] !== undefined && props['triggerRules'] !== '') {
        lines.push(`Path Rules: ${props['triggerRules']}`);
      }
      if (props['quietPeriodMode'] !== undefined && props['quietPeriodMode'] !== '') {
        lines.push(`Quiet Period: ${props['quietPeriodMode']}`);
        if (props['quietPeriod'] !== undefined && props['quietPeriod'] !== '') {
          lines.push(`Quiet Period Value: ${props['quietPeriod']}s`);
        }
      }
      if (
        props['enableQueueOptimization'] !== undefined &&
        props['enableQueueOptimization'] !== ''
      ) {
        lines.push(`Queue Optimization: ${props['enableQueueOptimization']}`);
      }
      break;

    case 'schedulingTrigger':
      if (props['schedulingPolicy'] !== undefined && props['schedulingPolicy'] !== '') {
        lines.push(`Schedule: ${formatSchedule(props['schedulingPolicy'])}`);
      }
      if (props['timezone'] !== undefined && props['timezone'] !== '') {
        lines.push(`Timezone: ${props['timezone']}`);
      }
      if (
        props['triggerBuildWithPendingChangesOnly'] !== undefined &&
        props['triggerBuildWithPendingChangesOnly'] !== ''
      ) {
        lines.push(`Only with pending changes: ${props['triggerBuildWithPendingChangesOnly']}`);
      }
      if (props['promoteWatchedBuild'] !== undefined && props['promoteWatchedBuild'] !== '') {
        lines.push(`Promote watched build: ${props['promoteWatchedBuild']}`);
      }
      // Handle build parameters
      Object.keys(props).forEach((key) => {
        if (key.startsWith('buildParams.')) {
          const paramName = key.substring('buildParams.'.length);
          lines.push(`Build Parameter: ${paramName} = ${props[key]}`);
        }
      });
      break;

    case 'buildDependencyTrigger':
      if (trigger.dependsOn !== undefined) {
        const deps = Array.isArray(trigger.dependsOn)
          ? trigger.dependsOn.join(', ')
          : trigger.dependsOn;
        lines.push(`Depends On: ${deps}`);
      } else if (props['dependsOn'] !== undefined && props['dependsOn'] !== '') {
        lines.push(`Depends On: ${props['dependsOn']}`);
      }

      if (trigger.afterSuccessfulBuildOnly !== undefined) {
        lines.push(`Only after successful: ${trigger.afterSuccessfulBuildOnly}`);
      } else if (
        props['afterSuccessfulBuildOnly'] !== undefined &&
        props['afterSuccessfulBuildOnly'] !== ''
      ) {
        lines.push(`Only after successful: ${props['afterSuccessfulBuildOnly']}`);
      }

      if (
        trigger.artifactRules !== undefined ||
        (props['artifactRules'] !== undefined && props['artifactRules'] !== '')
      ) {
        lines.push(`Artifact Rules: ${trigger.artifactRules ?? props['artifactRules']}`);
      }
      if (props['branchFilter'] !== undefined && props['branchFilter'] !== '') {
        lines.push(`Branch Filter: ${props['branchFilter']}`);
      }
      if (trigger.dependOnStartedBuild !== undefined || props['dependOnStartedBuild']) {
        lines.push(
          `Depend on started: ${trigger.dependOnStartedBuild ?? props['dependOnStartedBuild']}`
        );
      }
      if (trigger.promoteArtifacts !== undefined || props['promoteArtifacts']) {
        lines.push(`Promote artifacts: ${trigger.promoteArtifacts ?? props['promoteArtifacts']}`);
      }
      break;

    default:
      // Show all properties for unknown trigger types
      Object.entries(props).forEach(([key, value]) => {
        lines.push(`${key}: ${value}`);
      });
  }

  return lines;
}

/**
 * Format schedule for better readability
 */
function formatSchedule(schedule: string): string {
  // Check for TeamCity special formats
  if (schedule === 'daily') {
    return 'Daily at midnight';
  }
  if (schedule === 'weekly') {
    return 'Weekly on Sunday at midnight';
  }
  if (schedule === 'nightly') {
    return 'Nightly at 2 AM';
  }
  if (schedule === 'hourly') {
    return 'Every hour';
  }

  // Check if it looks like a cron expression
  const cronParts = schedule.split(/\s+/);
  if (cronParts.length >= 6) {
    // Try to parse as cron (basic interpretation)
    const [, minutes, hours, dayOfMonth, month] = cronParts;

    if (minutes === '0' && dayOfMonth === '*' && month === '*') {
      if (hours === '*') {
        return `Every hour at :00`;
      }
      if (hours !== undefined && hours !== '' && hours.match(/^\d+$/)) {
        const hour = parseInt(hours, 10);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        return `Daily at ${displayHour}:00 ${ampm}`;
      }
    }
  }

  // Return as-is if we can't parse it
  return schedule;
}
