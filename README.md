# SSH For EC2 Action

A GitHub Action that establishes a secure, ephemeral SSH connection to your EC2 instances using AWS Systems Manager (SSM) and EC2 Instance Connect (EIC).

## How It Works

1. **Ephemeral Keys:** Generates a temporary ED25519 SSH key pair on the GitHub runner.
2. **SSH Config:** Configures the runner's `~/.ssh/config` with a custom `ProxyCommand`.
3. **Just-in-Time Auth:** Whenever you run `ssh` or `rsync`, the proxy command pushes the public key to the EC2 instance via EC2 Instance Connect (valid for 60 seconds).
4. **SSM Tunnel:** The proxy command immediately tunnels the SSH connection through AWS SSM.

**Security Benefits:**

- **No persistent SSH keys** to manage, leak, or rotate.
- **No open inbound ports** (e.g., port 22) required on your Security Groups.
- **IAM-based access control** with connections logged in AWS CloudTrail.

## Prerequisites

### 1. EC2 Instance Setup

Your target EC2 instance must have:

- **SSM Agent** installed and running. (pre-installed on modern AWS AMIs)
- **EC2 Instance Connect** installed (pre-installed on modern AWS AMIs).
- An **IAM Instance Profile** attached with the `AmazonSSMManagedInstanceCore` managed policy (or equivalent permissions).

### 2. GitHub Actions IAM Role

The AWS credentials used by your workflow (e.g., via `aws-actions/configure-aws-credentials`) must have the following IAM permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ssm:StartSession",
      "Resource": [
        "arn:aws:ssm:*:*:document/AWS-StartSSHSession",
        "arn:aws:ec2:*:*:instance/i-ec2-instance-id"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "ec2-instance-connect:SendSSHPublicKey",
      "Resource": "arn:aws:ec2:*:*:instance/i-ec2-instance-id",
      "Condition": {
        "StringEquals": {
          "ec2:osuser": "ec2-user"
        }
      }
    }
  ]
}
```

> **Note:** Replace `i-ec2-instance-id` with your instance ID, and `ec2-user` with your target OS user (e.g., `ubuntu`). The `Condition` block is highly recommended to prevent privilege escalation to other users (like `root`).

## Usage

### Basic example

```yaml
name: SSH For EC2 Action Example
on:
  push:
    branches:
      - main
jobs:
  ssh:
    runs-on: ubuntu-latest
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: arn:aws:iam::123456789012:role/MyRole
          aws-region: us-west-2

      - name: Setup SSH Connection
        uses: bondz/ssh-ec2-action@v2
        with:
          ec2-instance-id: i-ec2-instance-id
          remote-user: ec2-user

      - name: Run remote commands
        run: |
          ssh i-ec2-instance-id "whoami"
          ssh i-ec2-instance-id "ls -la"
```

### Run a local script on the remote instance

```yaml
- name: Run deploy script
  run: ssh i-ec2-instance-id "bash -s" < ./scripts/deploy.sh
```

### Run a local script with arguments

```yaml
- name: Run deploy script with args
  run: ssh i-ec2-instance-id "bash -s" -- arg1 arg2 < ./scripts/deploy.sh
```

### Pipe content to the remote instance

```yaml
- name: Pipe file contents to remote
  run: cat ./scripts/deploy.sh | ssh i-ec2-instance-id "bash -s"
```

### Use rsync to copy files

```yaml
- name: Sync files to EC2
  run: rsync -avz ./local-dir/ i-ec2-instance-id:/remote-dir/
```

### Custom SSH port

```yaml
- name: Setup SSH Connection
  uses: bondz/ssh-ec2-action@v2
  with:
    ec2-instance-id: i-ec2-instance-id
    remote-user: ec2-user
    ssh-port: '2222'
```

## Compatibility & Third-Party Actions

This action relies on OpenSSH's `ProxyCommand` in `~/.ssh/config` to push keys just-in-time and tunnel traffic through SSM.

Third-party actions (like `appleboy/ssh-action`) use their own SSH clients (e.g., Go or Node.js libraries) which **bypass the `~/.ssh/config` file**. As a result, they will not automatically trigger the SSM tunnel or the key refresh.

- **If your instance is private (no port 22 access):** You must use native `ssh` or `rsync` commands in your `run` steps.
- **If your instance is public (port 22 open):** You can pass the `private-key-path` output to third-party actions, but the connection must be established within the 60-second window after the key is pushed.

For the most secure and reliable experience, we recommend using native `ssh` and `rsync` commands.

## Input Parameters

| Parameter       | Description                                        | Default    |
| --------------- | -------------------------------------------------- | ---------- |
| ec2-instance-id | The ID of the ec2 instance you want to connect to. |            |
| remote-user     | The user on the server to run commands             |            |
| ssh-port        | SSH port on the remote EC2 instance.               | 22         |
| aws-region      | The region your ec2 instance is in.                | AWS_REGION |

You don't need to set the `aws-region` parameter if your instance is in the same region as the credential you are using in the `aws-actions/configure-aws-credentials` step.

**The hostname for any SSH command should be the instance ID of your EC2 instance.**

## Outputs

| Output           | Description                                                      |
| ---------------- | ---------------------------------------------------------------- |
| private-key-path | The path to the runner-local private key for the SSH connection. |
