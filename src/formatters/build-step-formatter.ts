/**
 * Formatters for build step data
 */
import type { BuildStep } from '@/teamcity/build-step-manager';

/**
 * Format a single build step for display
 */
export function formatBuildStep(step: BuildStep): string {
  const status = step.enabled ? '✅' : '🚫';
  const params = Object.entries(step.parameters ?? {})
    .map(([key, value]) => `  - ${key}: ${value}`)
    .join('\n');

  let output = `${status} ${step.name} (${step.id})
  Type: ${step.type}
  Enabled: ${step.enabled}`;

  if (params) {
    output += `\n  Parameters:\n${params}`;
  }

  return output;
}

/**
 * Format a list of build steps for display
 */
export function formatBuildStepList(steps: BuildStep[], configId: string): string {
  const header = `Found ${steps.length} build steps in configuration ${configId}:\n`;
  const separator = `${'─'.repeat(60)}\n`;

  const stepList = steps
    .map((step, index) => {
      const position = `Step ${index + 1}:`;
      const status = step.enabled ? '✅' : '🚫';
      const mainInfo = `${status} ${step.name} (${step.id})`;
      const typeInfo = `   Type: ${step.type}`;

      // Show key parameters based on runner type
      let paramInfo = '';
      if (step.parameters != null) {
        const keyParams = getKeyParameters(step.type, step.parameters);
        if (keyParams.length > 0) {
          paramInfo = `\n   ${keyParams.join('\n   ')}`;
        }
      }

      return `${position} ${mainInfo}\n${typeInfo}${paramInfo}`;
    })
    .join(`\n${separator}`);

  return header + separator + stepList;
}

/**
 * Get key parameters to display based on runner type
 */
function getKeyParameters(type: string, parameters: Record<string, string>): string[] {
  const result: string[] = [];

  switch (type) {
    case 'simpleRunner':
      if (parameters['script.content']) {
        const script = parameters['script.content'];
        const preview = script.length > 50 ? `${script.substring(0, 50)}...` : script;
        result.push(`Script: ${preview}`);
      }
      break;

    case 'Maven2':
      if (parameters['goals']) {
        result.push(`Goals: ${parameters['goals']}`);
      }
      if (parameters['pomLocation']) {
        result.push(`POM: ${parameters['pomLocation']}`);
      }
      break;

    case 'gradle-runner':
      if (parameters['gradle.tasks']) {
        result.push(`Tasks: ${parameters['gradle.tasks']}`);
      }
      if (parameters['gradle.build.file']) {
        result.push(`Build file: ${parameters['gradle.build.file']}`);
      }
      break;

    case 'Docker':
      if (parameters['docker.command']) {
        result.push(`Command: ${parameters['docker.command']}`);
      }
      if (parameters['docker.image']) {
        result.push(`Image: ${parameters['docker.image']}`);
      }
      break;

    case 'dotnet':
      if (parameters['dotnet.command']) {
        result.push(`Command: ${parameters['dotnet.command']}`);
      }
      if (parameters['dotnet.project']) {
        result.push(`Project: ${parameters['dotnet.project']}`);
      }
      break;

    case 'MSBuild':
      if (parameters['msbuild.project']) {
        result.push(`Project: ${parameters['msbuild.project']}`);
      }
      if (parameters['msbuild.targets']) {
        result.push(`Targets: ${parameters['msbuild.targets']}`);
      }
      break;

    case 'nodejs-runner':
      if (parameters['nodejs.script']) {
        result.push(`Script: ${parameters['nodejs.script']}`);
      }
      break;

    case 'python':
      if (parameters['python.script']) {
        result.push(`Script: ${parameters['python.script']}`);
      }
      if (parameters['python.version']) {
        result.push(`Python: ${parameters['python.version']}`);
      }
      break;

    case 'cargo':
      if (parameters['cargo.command']) {
        result.push(`Command: ${parameters['cargo.command']}`);
      }
      break;

    case 'kotlinScript':
      if (parameters['kotlinScript.content']) {
        const script = parameters['kotlinScript.content'];
        const preview = script.length > 50 ? `${script.substring(0, 50)}...` : script;
        result.push(`Script: ${preview}`);
      }
      break;
  }

  return result;
}

/**
 * Format build step for detailed view
 */
export function formatBuildStepDetailed(step: BuildStep): string {
  const status = step.enabled ? '✅ Enabled' : '🚫 Disabled';

  let output = `Build Step: ${step.name}
══════════════════════════════════════
ID: ${step.id}
Type: ${step.type}
Status: ${status}`;

  if (step.executionMode && step.executionMode !== 'default') {
    output += `\nExecution Mode: ${step.executionMode}`;
  }

  if (step.parameters != null && Object.keys(step.parameters).length > 0) {
    output += '\n\nParameters:';
    for (const [key, value] of Object.entries(step.parameters)) {
      // Format multi-line values
      if (value.includes('\n')) {
        output += `\n  ${key}:\n    ${value.split('\n').join('\n    ')}`;
      } else {
        output += `\n  ${key}: ${value}`;
      }
    }
  }

  return output;
}
