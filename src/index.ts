import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { mkdirP } from '@actions/io';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SSH_HOST_ALIAS = 'gh-actions-ssm-host-' + crypto.randomUUID();
const SSH_DIR = path.join(os.homedir(), '.ssh');
const PRIVATE_KEY_PATH = path.join(SSH_DIR, SSH_HOST_ALIAS + '-key');
const PUBLIC_KEY_PATH = PRIVATE_KEY_PATH + '.pub';
const PROXY_SCRIPT_PATH = path.join(import.meta.dirname, 'proxy.js');
const keyIdentifier = SSH_HOST_ALIAS + '-' + (process.env.GITHUB_RUN_ID || 'local');

function assertInputMatches(
  name: string,
  value: string,
  pattern: RegExp,
  description: string,
): void {
  if (!pattern.test(value)) {
    throw new Error(`Input "${name}" must ${description}, got "${value}".`);
  }
}

function toForwardSlash(p: string): string {
  return p.replaceAll('\\', '/');
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export async function run(): Promise<void> {
  try {
    core.startGroup('Setup SSH via SSM: Initializing');

    const ec2InstanceId = core.getInput('ec2-instance-id', { required: true });
    const remoteUser = core.getInput('remote-user', { required: true });
    const sshPort = core.getInput('ssh-port') || '22';
    const awsRegion =
      core.getInput('aws-region') || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;

    if (!awsRegion) {
      throw new Error(
        'AWS region not specified. Please set the "aws-region" input or AWS_REGION/AWS_DEFAULT_REGION environment variable.',
      );
    }

    assertInputMatches(
      'ec2-instance-id',
      ec2InstanceId,
      /^i-[0-9a-fA-F]{8,17}$/,
      'be an EC2 instance ID like i-1234567890abcdef0',
    );
    assertInputMatches(
      'remote-user',
      remoteUser,
      /^[A-Za-z_][A-Za-z0-9._-]{0,63}$/,
      'start with a letter or underscore and contain only letters, numbers, dot, underscore, or hyphen',
    );
    assertInputMatches(
      'aws-region',
      awsRegion,
      /^[a-z]{2}(?:-[a-z]+)+-\d$/,
      'be an AWS region like us-west-2',
    );
    if (!/^[1-9]\d{0,4}$/.test(sshPort) || Number(sshPort) > 65535) {
      throw new Error(`ssh-port must be an integer between 1 and 65535, got "${sshPort}".`);
    }

    core.endGroup();

    core.startGroup('Setup SSH via SSM: Generating SSH Keys');

    await mkdirP(SSH_DIR);
    core.info(`Generating SSH key pair at ${PRIVATE_KEY_PATH}...`);

    await exec.exec('ssh-keygen', [
      '-t',
      'ed25519',
      '-N',
      '',
      '-f',
      PRIVATE_KEY_PATH,
      '-C',
      keyIdentifier,
    ]);
    await fs.chmod(PRIVATE_KEY_PATH, 0o600);

    core.info(`SSH key generated. Public key identifier: ${keyIdentifier}`);
    core.endGroup();

    core.startGroup('Setup SSH via SSM: Configuring Local SSH Client');

    const sshConfigPath = path.join(SSH_DIR, 'config');
    core.info(`Configuring SSH alias for EC2 Instance in ${sshConfigPath}...`);

    const proxyCommand = [
      shellQuote(toForwardSlash(process.execPath)),
      shellQuote(toForwardSlash(PROXY_SCRIPT_PATH)),
      '--region',
      shellQuote(awsRegion),
      '--user',
      shellQuote(remoteUser),
      '--public-key-path',
      shellQuote(toForwardSlash(PUBLIC_KEY_PATH)),
      '--port',
      sshPort,
      '%h',
    ].join(' ');

    const identityFile = `"${toForwardSlash(PRIVATE_KEY_PATH)}"`;

    const sshConfigContent = `
# SSH config for SSM session with EC2 Instance Connect ephemeral keys
Host ${ec2InstanceId}
  Port ${sshPort}
  ProxyCommand ${proxyCommand}
  User ${remoteUser}
  IdentityFile ${identityFile}
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
  ConnectTimeout 20
  LogLevel ERROR
`;
    await fs.appendFile(sshConfigPath, sshConfigContent);
    await fs.chmod(sshConfigPath, 0o600);
    core.info(`SSH config alias for EC2 Instance added.`);

    core.endGroup();

    core.startGroup('Setup SSH via SSM: Finalizing');

    core.setOutput('private-key-path', PRIVATE_KEY_PATH);

    core.info(
      `SSH setup via SSM complete. Use your EC2 Instance ID: '${ec2InstanceId}' for SSH/rsync.`,
    );
    core.endGroup();
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));

    if (process.env.SHOW_STACK_TRACE === 'true') {
      throw error;
    }
  }
}

await run();
