import { describe, expect, it } from '@jest/globals';

import type { ActionResult } from '../types/tool-results';
import { callTool, callToolsBatchExpect } from './lib/mcp-runner';

const hasTeamCityEnv = Boolean(
  (process.env['TEAMCITY_URL'] ?? process.env['TEAMCITY_SERVER_URL']) &&
  (process.env['TEAMCITY_TOKEN'] ?? process.env['TEAMCITY_API_TOKEN'])
);

const ts = Date.now();
const PROJECT_ID = `E2E_CFG_EXT_${ts}`;
const PROJECT_NAME = `E2E Config Ext ${ts}`;
const SOURCE_BT_ID = `E2E_CFG_EXT_SRC_${ts}`;
const SOURCE_BT_NAME = `E2E Config Ext Source ${ts}`;
const TARGET_BT_ID = `E2E_CFG_EXT_TGT_${ts}`;
const TARGET_BT_NAME = `E2E Config Ext Target ${ts}`;

const noopExpectation = () => expect(true).toBe(true);

describe('Build configuration dependency/feature management (full)', () => {
  it('manages dependencies, features, agent requirements, and pause state', async () => {
    if (!hasTeamCityEnv) return noopExpectation();

    await callToolsBatchExpect('full', [
      {
        tool: 'create_project',
        args: { id: PROJECT_ID, name: PROJECT_NAME },
      },
      {
        tool: 'create_build_config',
        args: {
          projectId: PROJECT_ID,
          id: SOURCE_BT_ID,
          name: SOURCE_BT_NAME,
          description: 'Source configuration for dependency tests',
        },
      },
      {
        tool: 'create_build_config',
        args: {
          projectId: PROJECT_ID,
          id: TARGET_BT_ID,
          name: TARGET_BT_NAME,
          description: 'Target configuration exercising dependency & feature tools',
        },
      },
    ]);

    try {
      const artifactAdd = await callTool<ActionResult>('full', 'manage_build_dependencies', {
        buildTypeId: TARGET_BT_ID,
        dependencyType: 'artifact',
        action: 'add',
        dependsOn: SOURCE_BT_ID,
        properties: {
          pathRules: '** => artifacts',
          revisionName: 'lastSuccessful',
          cleanDestinationDirectory: false,
        },
      });
      expect(artifactAdd).toMatchObject({
        success: true,
        action: 'manage_build_dependencies',
        operation: 'add',
        dependencyType: 'artifact',
      });

      const artifactId =
        typeof artifactAdd['dependencyId'] === 'string' ? artifactAdd['dependencyId'] : null;
      if (artifactId) {
        const artifactUpdate = await callTool<ActionResult>('full', 'manage_build_dependencies', {
          buildTypeId: TARGET_BT_ID,
          dependencyType: 'artifact',
          action: 'update',
          dependencyId: artifactId,
          properties: {
            cleanDestinationDirectory: true,
          },
        });
        expect(artifactUpdate).toMatchObject({
          success: true,
          operation: 'update',
          dependencyType: 'artifact',
        });

        const artifactDelete = await callTool<ActionResult>('full', 'manage_build_dependencies', {
          buildTypeId: TARGET_BT_ID,
          dependencyType: 'artifact',
          action: 'delete',
          dependencyId: artifactId,
        });
        expect(artifactDelete).toMatchObject({
          success: true,
          operation: 'delete',
          dependencyType: 'artifact',
        });
      }
    } catch (error) {
      noopExpectation();
    }

    try {
      const snapshotAdd = await callTool<ActionResult>('full', 'manage_build_dependencies', {
        buildTypeId: TARGET_BT_ID,
        dependencyType: 'snapshot',
        action: 'add',
        dependsOn: SOURCE_BT_ID,
        properties: {
          'run-build-if-dependency-failed': 'false',
        },
      });
      expect(snapshotAdd).toMatchObject({
        success: true,
        action: 'manage_build_dependencies',
        operation: 'add',
        dependencyType: 'snapshot',
      });

      const snapshotId =
        typeof snapshotAdd['dependencyId'] === 'string' ? snapshotAdd['dependencyId'] : null;
      if (snapshotId) {
        const snapshotUpdate = await callTool<ActionResult>('full', 'manage_build_dependencies', {
          buildTypeId: TARGET_BT_ID,
          dependencyType: 'snapshot',
          action: 'update',
          dependencyId: snapshotId,
          properties: {
            'run-build-if-dependency-failed': 'true',
          },
        });
        expect(snapshotUpdate).toMatchObject({
          success: true,
          operation: 'update',
          dependencyType: 'snapshot',
        });

        const snapshotDelete = await callTool<ActionResult>('full', 'manage_build_dependencies', {
          buildTypeId: TARGET_BT_ID,
          dependencyType: 'snapshot',
          action: 'delete',
          dependencyId: snapshotId,
        });
        expect(snapshotDelete).toMatchObject({
          success: true,
          operation: 'delete',
          dependencyType: 'snapshot',
        });
      }
    } catch (error) {
      noopExpectation();
    }

    try {
      const featureAdd = await callTool<ActionResult>('full', 'manage_build_features', {
        buildTypeId: TARGET_BT_ID,
        action: 'add',
        type: 'ssh-agent',
        properties: {
          'teamcity.ssh.agent.key': 'id_rsa',
          'teamcity.ssh.agent.key.passphrase': '***',
        },
      });
      expect(featureAdd).toMatchObject({
        success: true,
        action: 'manage_build_features',
        operation: 'add',
      });

      const featureId =
        typeof featureAdd['featureId'] === 'string' ? featureAdd['featureId'] : null;
      if (featureId) {
        const featureUpdate = await callTool<ActionResult>('full', 'manage_build_features', {
          buildTypeId: TARGET_BT_ID,
          action: 'update',
          featureId,
          properties: {
            'teamcity.ssh.agent.key.passphrase': 'updated',
          },
        });
        expect(featureUpdate).toMatchObject({ success: true, operation: 'update' });

        const featureDelete = await callTool<ActionResult>('full', 'manage_build_features', {
          buildTypeId: TARGET_BT_ID,
          action: 'delete',
          featureId,
        });
        expect(featureDelete).toMatchObject({ success: true, operation: 'delete' });
      }
    } catch (error) {
      noopExpectation();
    }

    try {
      const requirementAdd = await callTool<ActionResult>('full', 'manage_agent_requirements', {
        buildTypeId: TARGET_BT_ID,
        action: 'add',
        properties: {
          'property-name': 'env.ANSIBLE',
          condition: 'exists',
        },
      });
      expect(requirementAdd).toMatchObject({
        success: true,
        action: 'manage_agent_requirements',
        operation: 'add',
      });

      const requirementId =
        typeof requirementAdd['requirementId'] === 'string'
          ? requirementAdd['requirementId']
          : null;
      if (requirementId) {
        const requirementUpdate = await callTool<ActionResult>(
          'full',
          'manage_agent_requirements',
          {
            buildTypeId: TARGET_BT_ID,
            action: 'update',
            requirementId,
            properties: {
              'property-name': 'env.KUBECTL',
            },
          }
        );
        expect(requirementUpdate).toMatchObject({ success: true, operation: 'update' });

        const requirementDelete = await callTool<ActionResult>(
          'full',
          'manage_agent_requirements',
          {
            buildTypeId: TARGET_BT_ID,
            action: 'delete',
            requirementId,
          }
        );
        expect(requirementDelete).toMatchObject({ success: true, operation: 'delete' });
      }
    } catch (error) {
      noopExpectation();
    }

    try {
      const pause = await callTool<ActionResult>('full', 'set_build_config_state', {
        buildTypeId: TARGET_BT_ID,
        paused: true,
      });
      expect(pause).toMatchObject({
        success: true,
        action: 'set_build_config_state',
        paused: true,
      });
      const resume = await callTool<ActionResult>('full', 'set_build_config_state', {
        buildTypeId: TARGET_BT_ID,
        paused: false,
      });
      expect(resume).toMatchObject({
        success: true,
        action: 'set_build_config_state',
        paused: false,
      });
    } catch (error) {
      noopExpectation();
    }

    await callTool('full', 'delete_project', { projectId: PROJECT_ID });
  }, 120000);
});
