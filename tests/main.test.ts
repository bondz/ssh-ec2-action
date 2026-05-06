import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import * as core from '../__fixtures__/core.js';
import mocks from './mock.test';
import { run } from '../src/index';

vi.mock('@actions/core', () => core);
vi.mock('@actions/exec', () => ({
  exec: vi.fn().mockResolvedValue(0),
}));
vi.mock('@actions/io', () => ({
  mkdirP: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('node:fs', () => ({
  promises: {
    appendFile: vi.fn().mockResolvedValue(undefined),
    chmod: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('main.ts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    process.env = { ...mocks.envs };
  });

  describe('run', () => {
    beforeEach(() => {
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.TEST_INPUTS));
    });

    it('should run successfully', async () => {
      await run();

      expect(core.info).toHaveBeenCalled();
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('should set the private key output on success', async () => {
      await run();

      expect(core.setOutput).toHaveBeenCalledWith(
        'private-key-path',
        expect.stringContaining('.ssh/gh-actions-ssm-host-'),
      );
      expect(core.saveState).not.toHaveBeenCalled();
    });

    it('should write an SSH config that invokes the bundled proxy', async () => {
      const { promises: fs } = await import('node:fs');

      await run();

      const appendCall = vi.mocked(fs.appendFile).mock.calls[0];
      const sshConfig = appendCall[1] as string;

      expect(sshConfig).toContain(`Host ${mocks.TEST_INPUTS['ec2-instance-id']}`);
      expect(sshConfig).toContain('ProxyCommand ');
      expect(sshConfig).toMatch(/ProxyCommand\s+".*node.*"\s+".*\/proxy\.js"/);
      expect(sshConfig).toContain('--region "fake-region-1"');
      expect(sshConfig).toContain('--user "fake-user"');
      expect(sshConfig).toContain('--public-key-path "');
      expect(sshConfig).toMatch(/--port 22 %h/);
    });
  });

  describe('custom ssh port', () => {
    it('should use custom ssh port in SSH config and ProxyCommand flag', async () => {
      const customInputs = { ...mocks.TEST_INPUTS, 'ssh-port': '5792' };
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(customInputs));

      const { promises: fs } = await import('node:fs');
      await run();

      const appendCall = vi.mocked(fs.appendFile).mock.calls[0];
      const sshConfig = appendCall[1] as string;

      expect(sshConfig).toContain('Port 5792');
      expect(sshConfig).toContain('--port 5792 %h');
    });
  });

  describe('host key checking', () => {
    it('should accept and persist new host keys', async () => {
      const { promises: fs } = await import('node:fs');
      await run();
      const sshConfig = vi.mocked(fs.appendFile).mock.calls[0][1] as string;
      expect(sshConfig).toContain('StrictHostKeyChecking accept-new');
      expect(sshConfig).not.toContain('UserKnownHostsFile');
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

    it('should reject inputs containing newlines', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.TEST_INPUTS,
          'remote-user': 'ubuntu\nHost evil',
        }),
      );

      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('must not contain newline'),
      );
    });

    it('should reject inputs containing double quotes', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.TEST_INPUTS,
          'remote-user': 'foo"bar',
        }),
      );

      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('must not contain newline or quote'),
      );
    });

    it('should reject non-numeric ssh-port', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({ ...mocks.TEST_INPUTS, 'ssh-port': '22; rm -rf /' }),
      );

      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('ssh-port must be an integer'),
      );
    });

    it('should reject ssh-port above 65535', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({ ...mocks.TEST_INPUTS, 'ssh-port': '70000' }),
      );

      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('ssh-port must be an integer'),
      );
    });
  });
});
