import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PROXY = path.resolve(import.meta.dirname, '..', 'dist', 'proxy.js');

let tmp: string;
let logPath: string;
let keyPath: string;

function makeFakeAws(behavior: 'succeed' | 'fail-eic'): void {
  const script =
    behavior === 'succeed'
      ? `#!/usr/bin/env sh
{
  printf 'CALL\\n'
  for arg in "$@"; do printf '%s\\n' "$arg"; done
  printf 'ENDCALL\\n'
} >> "$AWS_FAKE_LOG"
exit 0
`
      : `#!/usr/bin/env sh
case "$2" in
  send-ssh-public-key) echo "fake aws: simulated EIC failure" >&2; exit 17 ;;
  *) exit 0 ;;
esac
`;
  const awsPath = path.join(tmp, 'aws');
  writeFileSync(awsPath, script, { mode: 0o755 });
}

function runProxy(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [PROXY, ...args], {
    env: { ...process.env, PATH: `${tmp}:${process.env.PATH}`, AWS_FAKE_LOG: logPath },
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('proxy.js', () => {
  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'proxy-test-'));
    logPath = path.join(tmp, 'aws.log');
    writeFileSync(logPath, '');
    keyPath = path.join(tmp, 'key.pub');
    writeFileSync(keyPath, 'ssh-ed25519 AAAAFAKEKEY user@host\n');
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('invokes both AWS subcommands with the expected argv', () => {
    makeFakeAws('succeed');

    const { status } = runProxy([
      '--region',
      'us-west-2',
      '--user',
      'ec2-user',
      '--public-key-path',
      keyPath,
      '--port',
      '2222',
      'i-deadbeef',
    ]);

    expect(status).toBe(0);

    const log = readFileSync(logPath, 'utf8');
    const calls = log
      .split(/^ENDCALL$/m)
      .map((c) =>
        c
          .replace(/^CALL\n/m, '')
          .trim()
          .split('\n')
          .filter(Boolean),
      )
      .filter((c) => c.length > 0);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([
      'ec2-instance-connect',
      'send-ssh-public-key',
      '--instance-id',
      'i-deadbeef',
      '--instance-os-user',
      'ec2-user',
      '--ssh-public-key',
      'ssh-ed25519 AAAAFAKEKEY user@host',
      '--region',
      'us-west-2',
    ]);
    expect(calls[1]).toEqual([
      'ssm',
      'start-session',
      '--target',
      'i-deadbeef',
      '--document-name',
      'AWS-StartSSHSession',
      '--parameters',
      'portNumber=2222',
      '--region',
      'us-west-2',
    ]);
  });

  it('defaults port to 22 when --port is omitted', () => {
    makeFakeAws('succeed');

    const { status } = runProxy([
      '--region',
      'us-west-2',
      '--user',
      'ec2-user',
      '--public-key-path',
      keyPath,
      'i-x',
    ]);

    expect(status).toBe(0);
    const log = readFileSync(logPath, 'utf8');
    expect(log).toContain('portNumber=22');
  });

  it('propagates a non-zero exit code from the EIC call', () => {
    makeFakeAws('fail-eic');

    const { status, stderr } = runProxy([
      '--region',
      'us-west-2',
      '--user',
      'ec2-user',
      '--public-key-path',
      keyPath,
      'i-x',
    ]);

    expect(status).toBe(17);
    expect(stderr).toContain('simulated EIC failure');
    // start-session must NOT be invoked if send-ssh-public-key fails.
    const log = readFileSync(logPath, 'utf8');
    expect(log).toBe('');
  });

  it('exits 2 with usage when required flags are missing', () => {
    makeFakeAws('succeed');

    const { status, stderr } = runProxy(['i-x']);

    expect(status).toBe(2);
    expect(stderr).toContain('usage:');
  });

  it('reads the public key from the file (not from a flag)', () => {
    // Multi-line content with spaces and special characters; if we ever
    // regress to interpolating the key into a shell template, this would
    // fail. Through argv it goes through cleanly.
    writeFileSync(keyPath, 'ssh-ed25519 AAAA"weird key with spaces\' user@h\n');
    makeFakeAws('succeed');

    const { status } = runProxy([
      '--region',
      'us-west-2',
      '--user',
      'ec2-user',
      '--public-key-path',
      keyPath,
      'i-x',
    ]);

    expect(status).toBe(0);
    const log = readFileSync(logPath, 'utf8');
    expect(log).toContain('ssh-ed25519 AAAA"weird key with spaces\' user@h');
  });
});
