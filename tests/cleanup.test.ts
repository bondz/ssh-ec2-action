import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import * as core from '../__fixtures__/core.js';
import { mockClient } from 'aws-sdk-client-mock';
import { SendCommandCommand, SSMClient } from '@aws-sdk/client-ssm';
import mocks from './mock.test';

const mockedSSMClient = mockClient(SSMClient);

vi.mock('@actions/core', () => core);
vi.mock('@actions/io', () => ({
  rmRF: vi.fn().mockResolvedValue(undefined),
}));

// The cleanup module has a top-level cleanup() call that runs on import.
// We need to set up the default mocks before importing so it doesn't throw.
vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.TEST_INPUTS));
vi.spyOn(core, 'getState').mockReturnValue('');

const { cleanup } = await import('../src/cleanup/index');

describe('cleanup.ts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedSSMClient.reset();
    process.env = { ...mocks.envs };
  });

  describe('cleanup', () => {
    beforeEach(() => {
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.TEST_INPUTS));
    });

    it('should remove public key and delete local keys', async () => {
      vi.spyOn(core, 'getState').mockImplementation((name: string) => {
        const state: Record<string, string> = {
          setupComplete: 'true',
          keyIdentifier: 'gh-actions-ssm-host-test-key',
          privateKeyPath: '/home/runner/.ssh/gh-actions-ssm-host-test-key',
        };
        return state[name] || '';
      });
      mockedSSMClient.on(SendCommandCommand).resolvesOnce(mocks.outputs.UPDATE_SSM_DOCUMENT);

      await cleanup();

      const calls = mockedSSMClient.commandCalls(SendCommandCommand);
      expect(calls).toHaveLength(1);

      const input = calls[0].args[0].input;
      expect(input.InstanceIds).toEqual(['i-1234567890abcdef0']);
      expect(input.DocumentName).toBe('AWS-RunShellScript');
      expect(input.Parameters?.commands?.[0]).toContain('gh-actions-ssm-host-test-key');
      expect(input.Parameters?.commands?.[0]).toContain('authorized_keys');

      expect(core.info).toHaveBeenCalledWith('SSH via SSM cleanup process finished.');
    });

    it('should skip key removal when keyIdentifier is missing', async () => {
      vi.spyOn(core, 'getState').mockImplementation((name: string) => {
        const state: Record<string, string> = {
          setupComplete: 'true',
          keyIdentifier: '',
          privateKeyPath: '/home/runner/.ssh/some-key',
        };
        return state[name] || '';
      });

      await cleanup();

      const calls = mockedSSMClient.commandCalls(SendCommandCommand);
      expect(calls).toHaveLength(0);
      expect(core.info).toHaveBeenCalledWith(
        'Skipping public key removal: Missing required identifiers.',
      );
    });

    it('should skip local key deletion when privateKeyPath is missing', async () => {
      vi.spyOn(core, 'getState').mockImplementation((name: string) => {
        const state: Record<string, string> = {
          setupComplete: 'true',
          keyIdentifier: 'some-key',
          privateKeyPath: '',
        };
        return state[name] || '';
      });
      mockedSSMClient.on(SendCommandCommand).resolvesOnce(mocks.outputs.UPDATE_SSM_DOCUMENT);

      await cleanup();

      expect(core.info).toHaveBeenCalledWith(
        'Skipping local key deletion: Private key path not found.',
      );
    });

    it('should warn when setup did not complete', async () => {
      vi.spyOn(core, 'getState').mockReturnValue('');

      await cleanup();

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Setup may not have completed'),
      );
    });

    it('should handle SSM failure gracefully during cleanup', async () => {
      vi.spyOn(core, 'getState').mockImplementation((name: string) => {
        const state: Record<string, string> = {
          setupComplete: 'true',
          keyIdentifier: 'gh-actions-ssm-host-test-key',
          privateKeyPath: '/home/runner/.ssh/gh-actions-ssm-host-test-key',
        };
        return state[name] || '';
      });
      mockedSSMClient.on(SendCommandCommand).rejectsOnce(new Error('SSM timeout'));

      await cleanup();

      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('SSM timeout'));
      // Cleanup should still finish (not throw)
      expect(core.info).toHaveBeenCalledWith('SSH via SSM cleanup process finished.');
    });

    it('should fail when aws-region is missing', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          'ec2-instance-id': 'i-123',
          'remote-user': 'ubuntu',
        }),
      );
      vi.spyOn(core, 'getState').mockReturnValue('');
      process.env = {};

      await expect(cleanup()).rejects.toThrow('AWS region not specified');
    });
  });
});
