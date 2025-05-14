import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as io from '@actions/io'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { SSMClient, SendCommandCommand } from '@aws-sdk/client-ssm'

// Constants
const SSH_HOST_ALIAS = 'gh-actions-ssm-host-' + crypto.randomUUID()
const SSH_DIR = path.join(os.homedir(), '.ssh')
const PRIVATE_KEY_FILENAME = SSH_HOST_ALIAS + '-key'
const PRIVATE_KEY_PATH = path.join(SSH_DIR, PRIVATE_KEY_FILENAME)
const PUBLIC_KEY_PATH = PRIVATE_KEY_PATH + '.pub'
const keyIdentifier =
  SSH_HOST_ALIAS + '-' + (process.env.GITHUB_RUN_ID || 'local')
const SCRIPT_TIMEOUT_SECONDS = 300

export async function run(): Promise<void> {
  try {
    core.startGroup('Setup SSH via SSM: Initializing')

    const ec2InstanceId = core.getInput('ec2-instance-id', { required: true })
    const remoteUser = core.getInput('remote-user', { required: true })
    const awsRegion =
      core.getInput('aws-region') ||
      process.env.AWS_REGION ||
      process.env.AWS_DEFAULT_REGION

    if (!awsRegion) {
      throw new Error(
        'AWS region not specified. Please set the "aws-region" input or AWS_REGION/AWS_DEFAULT_REGION environment variable.'
      )
    }

    const ssmClient = new SSMClient({
      region: awsRegion
    })

    core.info('Determining AWS caller identity...')

    core.endGroup()

    core.startGroup('Setup SSH via SSM: Generating SSH Keys')

    await io.mkdirP(SSH_DIR)
    core.info(`Generating SSH key pair at ${PRIVATE_KEY_PATH}...`)

    // Clean up potential leftover keys from previous runs
    try {
      await Promise.all([io.rmRF(PRIVATE_KEY_PATH), io.rmRF(PUBLIC_KEY_PATH)])
    } catch {
      /* ignore */
    }

    await exec.exec('ssh-keygen', [
      '-t',
      'ecdsa',
      '-b',
      '256',
      '-N',
      '',
      '-f',
      PRIVATE_KEY_PATH,
      '-C',
      keyIdentifier
    ])
    await exec.exec('chmod', ['600', PRIVATE_KEY_PATH])

    const publicKeyContent = (await fs.readFile(PUBLIC_KEY_PATH, 'utf8')).trim()

    core.info(`SSH key generated. Public key identifier: ${keyIdentifier}`)
    core.endGroup()

    core.startGroup('Setup SSH via SSM: Configuring EC2 Instance')

    core.info(
      `Adding public key (${keyIdentifier}) to EC2 instance ${ec2InstanceId}...`
    )

    const escapedPublicKeyWithId = publicKeyContent.replace(/'/g, "'\\''") // Escape single quotes for shell
    const commandToAddKey = `mkdir -p ~/.ssh && echo '${escapedPublicKeyWithId}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && chmod 700 ~/.ssh`
    const addKeyCmd = new SendCommandCommand({
      InstanceIds: [ec2InstanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [`sudo su - ${remoteUser} -c "${commandToAddKey}"`]
      },
      Comment: `Add temporary SSH key: ${keyIdentifier}`,
      TimeoutSeconds: SCRIPT_TIMEOUT_SECONDS
    })
    const sendAddKeyResult = await ssmClient.send(addKeyCmd)
    core.debug(
      `SSM SendCommand (Add Key) result: ${JSON.stringify(sendAddKeyResult.Command?.CommandId)}`
    )
    core.info(
      'Command to add public key sent to EC2 instance. Waiting for propagation...'
    )

    core.endGroup()

    core.startGroup('Setup SSH via SSM: Configuring Local SSH Client')

    core.info(
      `Configuring SSH alias '${SSH_HOST_ALIAS}' in ${path.join(SSH_DIR, 'config')}...`
    )
    const sshConfigPath = path.join(SSH_DIR, 'config')
    const proxyRunner =
      os.platform() === 'win32'
        ? 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
        : 'sh -c'

    const sshConfigContent = `
# SSH config for SSM session
Host ${ec2InstanceId}
  ProxyCommand ${proxyRunner} "aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters 'portNumber=%p' --region ${awsRegion}"
  User ${remoteUser}
  IdentityFile ${PRIVATE_KEY_PATH}
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
  ConnectTimeout 20
  LogLevel ERROR
`
    await fs.appendFile(sshConfigPath, sshConfigContent)
    await exec.exec('chmod', ['600', sshConfigPath])
    core.info(`SSH config for alias '${SSH_HOST_ALIAS}' added/updated.`)

    core.endGroup()

    core.startGroup('Setup SSH via SSM: Finalizing')

    core.saveState('keyIdentifier', keyIdentifier)
    core.saveState('privateKeyPath', PRIVATE_KEY_PATH)
    core.saveState('setupComplete', 'true')

    core.info(
      `SSH setup via SSM complete. Use alias '${SSH_HOST_ALIAS}' for SSH/rsync.`
    )
    core.endGroup()
  } catch (error: unknown) {
    core.saveState('keyIdentifier', keyIdentifier)
    core.saveState('privateKeyPath', PRIVATE_KEY_PATH)

    core.setFailed(error instanceof Error ? error.message : String(error))

    if (process.env.SHOW_STACK_TRACE === 'true') {
      throw error
    }
  }
}
