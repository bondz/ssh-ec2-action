import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import * as core from '../__fixtures__/core.js';
import { mockClient } from 'aws-sdk-client-mock';
import { SendCommandCommand, SSMClient } from '@aws-sdk/client-ssm';
import mocks from './mock.test';
import { run } from '../src/index';

const mockedSSMClient = mockClient(SSMClient);

vi.mock('@actions/core', () => core);
vi.mock('@actions/exec', () => ({
  exec: vi.fn().mockResolvedValue(0),
}));
vi.mock('@actions/io', () => ({
  mkdirP: vi.fn().mockResolvedValue(undefined),
  rmRF: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn().mockResolvedValue('ecdsa-sha2-nistp256 AAAA... key-id\n'),
    appendFile: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('main.ts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mockedSSMClient.reset();
    process.env = { ...mocks.envs };
  });

  describe('run', () => {
    beforeEach(() => {
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.TEST_INPUTS));
      mockedSSMClient.on(SendCommandCommand).resolvesOnce(mocks.outputs.UPDATE_SSM_DOCUMENT);
    });

    it('should run successfully', async () => {
      await run();

      expect(core.info).toHaveBeenCalled();
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('should save state on success', async () => {
      await run();

      expect(core.saveState).toHaveBeenCalledWith('setupComplete', 'true');
      expect(core.saveState).toHaveBeenCalledWith(
        'keyIdentifier',
        expect.stringContaining('gh-actions-ssm-host-'),
      );
      expect(core.saveState).toHaveBeenCalledWith(
        'privateKeyPath',
        expect.stringContaining('.ssh/'),
      );
    });

    it('should send SSM command to add public key', async () => {
      await run();

      const calls = mockedSSMClient.commandCalls(SendCommandCommand);
      expect(calls).toHaveLength(1);

      const input = calls[0].args[0].input;
      expect(input.InstanceIds).toEqual(['i-1234567890abcdef0']);
      expect(input.DocumentName).toBe('AWS-RunShellScript');
      expect(input.Parameters?.commands?.[0]).toContain('fake-user');
      expect(input.Parameters?.commands?.[0]).toContain('authorized_keys');
    });
  });

  describe('custom ssh port', () => {
    it('should use custom ssh port in SSH config', async () => {
      const customInputs = { ...mocks.TEST_INPUTS, 'ssh-port': '5792' };
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(customInputs));
      mockedSSMClient.on(SendCommandCommand).resolvesOnce(mocks.outputs.UPDATE_SSM_DOCUMENT);

      const { promises: fs } = await import('node:fs');
      await run();

      const appendCall = vi.mocked(fs.appendFile).mock.calls[0];
      const sshConfig = appendCall[1] as string;
      expect(sshConfig).toContain("portNumber=5792'");
      expect(sshConfig).toContain('Port 5792');
    });
  });

  describe('error handling', () => {
    it('should fail when aws-region is missing', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          'ec2-instance-id': 'i-123',
          'remote-user': 'ubuntu',
        }),
      );
      process.env = { GITHUB_RUN_ID: 'test' };

      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('AWS region not specified'),
      );
    });

    it('should save state even on failure', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          'ec2-instance-id': 'i-123',
          'remote-user': 'ubuntu',
        }),
      );
      process.env = { GITHUB_RUN_ID: 'test' };

      await run();

      expect(core.saveState).toHaveBeenCalledWith('keyIdentifier', expect.any(String));
      expect(core.saveState).toHaveBeenCalledWith('privateKeyPath', expect.any(String));
    });

    it('should fail when SSM command fails', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.TEST_INPUTS));
      mockedSSMClient.on(SendCommandCommand).rejectsOnce(new Error('SSM service unavailable'));

      await run();

      expect(core.setFailed).toHaveBeenCalledWith('SSM service unavailable');
    });
  });
});
