#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  options: {
    region: { type: 'string' },
    user: { type: 'string' },
    'public-key-path': { type: 'string' },
    port: { type: 'string', default: '22' },
  },
  allowPositionals: true,
});

const host = positionals[0];
const region = values.region;
const user = values.user;
const publicKeyPath = values['public-key-path'];
const port = values.port;

if (!host || !region || !user || !publicKeyPath) {
  console.error(
    'usage: proxy.js --region <r> --user <u> --public-key-path <p> [--port <n>] <host>',
  );
  process.exit(2);
}

const publicKey = readFileSync(publicKeyPath, 'utf8').trim();
if (!publicKey || /[\r\n]/.test(publicKey)) {
  console.error('public key file must contain exactly one non-empty line');
  process.exit(2);
}

const send = spawnSync(
  'aws',
  [
    'ec2-instance-connect',
    'send-ssh-public-key',
    '--instance-id',
    host,
    '--instance-os-user',
    user,
    '--ssh-public-key',
    publicKey,
    '--region',
    region,
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);
if (send.status !== 0) {
  process.exit(send.status ?? 1);
}

const session = spawn(
  'aws',
  [
    'ssm',
    'start-session',
    '--target',
    host,
    '--document-name',
    'AWS-StartSSHSession',
    '--parameters',
    `portNumber=${port}`,
    '--region',
    region,
  ],
  { stdio: 'inherit' },
);

session.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
