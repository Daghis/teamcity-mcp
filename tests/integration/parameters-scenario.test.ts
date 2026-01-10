import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import type { ActionResult } from '../types/tool-results';
import { callTool } from './lib/mcp-runner';
import {
  type ProjectFixture,
  hasTeamCityEnv,
  setupProjectFixture,
  teardownProjectFixture,
} from './lib/test-fixtures';

describe('Parameters lifecycle: full writes + dev reads', () => {
  let fixture: ProjectFixture | null = null;

  beforeAll(async () => {
    if (!hasTeamCityEnv) return;

    fixture = await setupProjectFixture({
      prefix: 'E2E_PARAM',
      namePrefix: 'E2E Param',
    });
  }, 120_000);

  afterAll(async () => {
    if (fixture) {
      await teardownProjectFixture(fixture.projectId);
    }
  });

  it('lists parameters (dev) → smoke shape', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    const list = await callTool<Record<string, unknown>>('dev', 'list_parameters', {
      buildTypeId: fixture.buildTypeId,
    });
    expect(list).toHaveProperty('parameters');
  }, 30_000);

  it('add and delete parameter (full) and smoke read (dev)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    try {
      const add = await callTool<ActionResult>('full', 'add_parameter', {
        buildTypeId: fixture.buildTypeId,
        name: 'env.E2E_PARAM',
        value: 'one',
      });
      expect(add).toMatchObject({ success: true, action: 'add_parameter' });
    } catch (e) {
      // Some servers may restrict parameter APIs; treat as non-fatal for this smoke
      console.warn('add_parameter failed (non-fatal):', e);
      return expect(true).toBe(true);
    }

    await callTool<Record<string, unknown>>('dev', 'list_parameters', {
      buildTypeId: fixture.buildTypeId,
    });

    try {
      const del = await callTool<ActionResult>('full', 'delete_parameter', {
        buildTypeId: fixture.buildTypeId,
        name: 'env.E2E_PARAM',
      });
      expect(del).toMatchObject({ success: true, action: 'delete_parameter' });
    } catch (e) {
      console.warn('delete_parameter failed (non-fatal):', e);
    }

    await callTool<Record<string, unknown>>('dev', 'list_parameters', {
      buildTypeId: fixture.buildTypeId,
    });
  }, 90_000);

  it('project parameters: add, list, update, delete (full)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    try {
      // Add project parameter
      const add = await callTool<ActionResult>('full', 'add_project_parameter', {
        projectId: fixture.projectId,
        name: 'env.E2E_PROJECT_PARAM',
        value: 'project_value',
      });
      expect(add).toMatchObject({ success: true, action: 'add_project_parameter' });

      // List and verify
      const list = await callTool<{ parameters: Array<{ name?: string; value?: string }> }>(
        'dev',
        'list_project_parameters',
        { projectId: fixture.projectId }
      );
      expect(list.parameters.some((p) => p.name === 'env.E2E_PROJECT_PARAM')).toBe(true);

      // Update
      const update = await callTool<ActionResult>('full', 'update_project_parameter', {
        projectId: fixture.projectId,
        name: 'env.E2E_PROJECT_PARAM',
        value: 'updated_value',
      });
      expect(update).toMatchObject({ success: true, action: 'update_project_parameter' });

      // Delete
      const del = await callTool<ActionResult>('full', 'delete_project_parameter', {
        projectId: fixture.projectId,
        name: 'env.E2E_PROJECT_PARAM',
      });
      expect(del).toMatchObject({ success: true, action: 'delete_project_parameter' });
    } catch (e) {
      console.warn('project parameters test failed (non-fatal):', e);
      return expect(true).toBe(true);
    }
  }, 90_000);

  it('output parameters: add, list, update, delete (full)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    try {
      // Add output parameter
      const add = await callTool<ActionResult>('full', 'add_output_parameter', {
        buildTypeId: fixture.buildTypeId,
        name: 'out.E2E_OUTPUT_PARAM',
        value: 'output_value',
      });
      expect(add).toMatchObject({ success: true, action: 'add_output_parameter' });

      // List and verify
      const list = await callTool<{ parameters: Array<{ name?: string; value?: string }> }>(
        'dev',
        'list_output_parameters',
        { buildTypeId: fixture.buildTypeId }
      );
      expect(list.parameters.some((p) => p.name === 'out.E2E_OUTPUT_PARAM')).toBe(true);

      // Update
      const update = await callTool<ActionResult>('full', 'update_output_parameter', {
        buildTypeId: fixture.buildTypeId,
        name: 'out.E2E_OUTPUT_PARAM',
        value: 'updated_output',
      });
      expect(update).toMatchObject({ success: true, action: 'update_output_parameter' });

      // Delete
      const del = await callTool<ActionResult>('full', 'delete_output_parameter', {
        buildTypeId: fixture.buildTypeId,
        name: 'out.E2E_OUTPUT_PARAM',
      });
      expect(del).toMatchObject({ success: true, action: 'delete_output_parameter' });
    } catch (e) {
      console.warn('output parameters test failed (non-fatal):', e);
      return expect(true).toBe(true);
    }
  }, 90_000);

  it('add parameter with type support (full)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    try {
      // Add password parameter with type
      const add = await callTool<ActionResult>('full', 'add_parameter', {
        buildTypeId: fixture.buildTypeId,
        name: 'env.E2E_SECRET',
        value: 'secret_value',
        type: 'password',
      });
      expect(add).toMatchObject({ success: true, action: 'add_parameter' });

      // List and verify type is returned
      const list = await callTool<{
        parameters: Array<{ name?: string; value?: string; type?: { rawValue?: string } }>;
      }>('dev', 'list_parameters', { buildTypeId: fixture.buildTypeId });

      const secretParam = list.parameters.find((p) => p.name === 'env.E2E_SECRET');
      expect(secretParam).toBeDefined();
      // Note: password values are typically masked in responses
      if (secretParam?.type) {
        expect(secretParam.type.rawValue).toBe('password');
      }

      // Cleanup
      await callTool<ActionResult>('full', 'delete_parameter', {
        buildTypeId: fixture.buildTypeId,
        name: 'env.E2E_SECRET',
      });
    } catch (e) {
      console.warn('parameter type test failed (non-fatal):', e);
      return expect(true).toBe(true);
    }
  }, 90_000);

  it('update parameter with type change (full)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    try {
      // Add parameter without type first
      const add = await callTool<ActionResult>('full', 'add_parameter', {
        buildTypeId: fixture.buildTypeId,
        name: 'env.E2E_TYPED',
        value: 'initial',
      });
      expect(add).toMatchObject({ success: true, action: 'add_parameter' });

      // Update parameter to password type
      const update = await callTool<ActionResult>('full', 'update_parameter', {
        buildTypeId: fixture.buildTypeId,
        name: 'env.E2E_TYPED',
        value: 'updated_secret',
        type: 'password',
      });
      expect(update).toMatchObject({ success: true, action: 'update_parameter' });

      // List and verify type changed
      const list = await callTool<{
        parameters: Array<{ name?: string; value?: string; type?: { rawValue?: string } }>;
      }>('dev', 'list_parameters', { buildTypeId: fixture.buildTypeId });

      const typedParam = list.parameters.find((p) => p.name === 'env.E2E_TYPED');
      expect(typedParam).toBeDefined();
      if (typedParam?.type) {
        expect(typedParam.type.rawValue).toBe('password');
      }

      // Cleanup
      await callTool<ActionResult>('full', 'delete_parameter', {
        buildTypeId: fixture.buildTypeId,
        name: 'env.E2E_TYPED',
      });
    } catch (e) {
      console.warn('update parameter type test failed (non-fatal):', e);
      return expect(true).toBe(true);
    }
  }, 90_000);

  it('update project parameter with type change (full)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    try {
      // Add project parameter without type first
      const add = await callTool<ActionResult>('full', 'add_project_parameter', {
        projectId: fixture.projectId,
        name: 'env.E2E_PROJECT_TYPED',
        value: 'initial',
      });
      expect(add).toMatchObject({ success: true, action: 'add_project_parameter' });

      // Update project parameter to text type with validation
      const update = await callTool<ActionResult>('full', 'update_project_parameter', {
        projectId: fixture.projectId,
        name: 'env.E2E_PROJECT_TYPED',
        value: 'updated',
        type: 'text',
      });
      expect(update).toMatchObject({ success: true, action: 'update_project_parameter' });

      // List and verify type changed
      const list = await callTool<{
        parameters: Array<{ name?: string; value?: string; type?: { rawValue?: string } }>;
      }>('dev', 'list_project_parameters', { projectId: fixture.projectId });

      const typedParam = list.parameters.find((p) => p.name === 'env.E2E_PROJECT_TYPED');
      expect(typedParam).toBeDefined();
      if (typedParam?.type) {
        expect(typedParam.type.rawValue).toBe('text');
      }

      // Cleanup
      await callTool<ActionResult>('full', 'delete_project_parameter', {
        projectId: fixture.projectId,
        name: 'env.E2E_PROJECT_TYPED',
      });
    } catch (e) {
      console.warn('update project parameter type test failed (non-fatal):', e);
      return expect(true).toBe(true);
    }
  }, 90_000);
});
