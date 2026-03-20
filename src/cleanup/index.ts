import * as core from '@actions/core';
import * as io from '@actions/io';
import { SSMClient, SendCommandCommand } from '@aws-sdk/client-ssm';

const SCRIPT_TIMEOUT_SECONDS = 300;

// Helper to run cleanup steps and log warnings on failure
async function runCleanupStep(name: string, fn: () => Promise<void>): Promise<void> {
  core.startGroup(`Cleanup Step: ${name}`);
  try {
    await fn();
    core.info(`Cleanup step '${name}' completed.`);
  } catch (error: unknown) {
    core.warning(
      `Cleanup step '${name}' failed: ${error instanceof Error ? error.message : String(error)}`,
    );

    if (core.isDebug()) {
      core.debug(error instanceof Error ? error.stack || error.message : String(error));
    }
  } finally {
    core.endGroup();
  }
}

// --- Main cleanup function ---
export async function cleanup(): Promise<void> {
  core.info('Starting SSH via SSM cleanup process...');

  const setupComplete = !!core.getState('setupComplete');
  const keyIdentifier = core.getState('keyIdentifier');
  const privateKeyPath = core.getState('privateKeyPath');

  if (!setupComplete && !keyIdentifier && !privateKeyPath) {
    core.info('Setup did not complete. Skipping cleanup.');
    return;
  }

  const ec2InstanceId = core.getInput('ec2-instance-id');
  const remoteUser = core.getInput('remote-user');

  const awsRegion =
    core.getInput('aws-region') || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;

  if (!awsRegion) {
    core.warning('AWS region not available. Skipping remote cleanup.');
  }

  core.info(
    `Retrieved state: setupComplete=${setupComplete}, keyIdentifier=${keyIdentifier || 'N/A'}, privateKeyPath=${privateKeyPath || 'N/A'}`,
  );

  // 1. Remove Public Key from EC2 Instance
  await runCleanupStep('Remove Public Key from EC2', async () => {
    if (setupComplete && keyIdentifier && awsRegion) {
      core.info(`Removing public key ('${keyIdentifier}') from EC2 instance ${ec2InstanceId}...`);

      const ssmClient = new SSMClient({ region: awsRegion });
      const commandToRemoveKey = `sed -i '/${keyIdentifier}/d' ~/.ssh/authorized_keys`;
      const removeKeyCmd = new SendCommandCommand({
        InstanceIds: [ec2InstanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: {
          commands: [`sudo su - ${remoteUser} -c "${commandToRemoveKey}"`],
        },
        Comment: `Remove temporary SSH key: ${keyIdentifier}`,
        TimeoutSeconds: SCRIPT_TIMEOUT_SECONDS,
      });
      const sendRemoveKeyResult = await ssmClient.send(removeKeyCmd);
      core.debug(
        `SSM SendCommand (Remove Key) result: ${JSON.stringify(sendRemoveKeyResult.Command?.CommandId)}`,
      );
      core.info('Command to remove public key sent.');
    } else {
      core.info('Skipping public key removal: Missing required identifiers.');
    }
  });

  // Delete Temporary Local SSH Key Pair
  await runCleanupStep('Delete Local SSH Keys', async () => {
    if (privateKeyPath) {
      const publicKeyPath = privateKeyPath + '.pub';
      core.info(`Deleting local SSH keys: ${privateKeyPath} and ${publicKeyPath}...`);
      await Promise.all([io.rmRF(privateKeyPath), io.rmRF(publicKeyPath)]);
      core.info('Local SSH keys deleted.');
    } else {
      core.info('Skipping local key deletion: Private key path not found.');
    }
  });

  core.info('SSH via SSM cleanup process finished.');
}

/* c8 ignore start */
try {
  cleanup();
} catch (error) {
  core.setFailed(error instanceof Error ? error.message : String(error));
}
