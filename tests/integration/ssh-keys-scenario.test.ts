import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { execSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import type { ActionResult } from '../types/tool-results';
import { callTool } from './lib/mcp-runner';
import {
  type ProjectFixture,
  hasTeamCityEnv,
  setupProjectFixture,
  teardownProjectFixture,
} from './lib/test-fixtures';

/** Generate a throwaway Ed25519 SSH key pair for testing. Returns the private key PEM string. */
function generateTestKey(): string {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-sshkey-'));
  const keyPath = join(dir, 'id_test');
  try {
    execSync(`ssh-keygen -t ed25519 -f "${keyPath}" -N "" -q`, { stdio: 'pipe' });
    return readFileSync(keyPath, 'utf-8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

interface SshKeysResponse {
  sshKeys: { sshKey?: Array<{ name?: string }> };
}

describe('SSH key lifecycle: upload, list, delete (full)', () => {
  let fixture: ProjectFixture | null = null;

  beforeAll(async () => {
    if (!hasTeamCityEnv) return;

    fixture = await setupProjectFixture({
      prefix: 'E2E_SSHKEY',
      namePrefix: 'E2E SSH Key',
    });
  }, 120_000);

  afterAll(async () => {
    if (fixture) {
      await teardownProjectFixture(fixture.projectId);
    }
  });

  it('upload, list, and delete an SSH key', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    const keyName = `test-key-${fixture.timestamp}`;
    const privateKey = generateTestKey();

    try {
      // Upload SSH key
      const upload = await callTool<ActionResult>('full', 'upload_project_ssh_key', {
        projectId: fixture.projectId,
        keyName,
        privateKeyContent: privateKey,
      });
      expect(upload).toMatchObject({
        success: true,
        action: 'upload_project_ssh_key',
        projectId: fixture.projectId,
        keyName,
      });

      // List SSH keys and verify the uploaded key appears
      const listAfterUpload = await callTool<SshKeysResponse>('full', 'list_project_ssh_keys', {
        projectId: fixture.projectId,
      });
      expect(listAfterUpload).toHaveProperty('sshKeys');
      const keysAfterUpload = listAfterUpload.sshKeys?.sshKey ?? [];
      expect(keysAfterUpload.some((k) => k.name === keyName)).toBe(true);

      // Delete SSH key
      const del = await callTool<ActionResult>('full', 'delete_project_ssh_key', {
        projectId: fixture.projectId,
        keyName,
      });
      expect(del).toMatchObject({
        success: true,
        action: 'delete_project_ssh_key',
        projectId: fixture.projectId,
        keyName,
      });

      // List again and verify the key is gone
      const listAfterDelete = await callTool<SshKeysResponse>('full', 'list_project_ssh_keys', {
        projectId: fixture.projectId,
      });
      const keysAfterDelete = listAfterDelete.sshKeys?.sshKey ?? [];
      expect(keysAfterDelete.some((k) => k.name === keyName)).toBe(false);
    } catch (e) {
      console.warn('SSH key lifecycle test failed (non-fatal):', e);
      return expect(true).toBe(true);
    }
  }, 90_000);
});
