# Introduction

SSH For EC2 Action is a GitHub Action that allows you to SSH into an EC2
instance and run commands using
[AWS Systems Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-sessions-start.html).

This means you can execute commands on your EC2 instances without needing to
open SSH ports or manage SSH keys. The action uses the AWS Systems Manager
Session Manager to establish a secure connection to your instance.

## Usage

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
        id: ssh-connection
        with:
          ec2-instance-id: i-ec2-instance-id
          remote-user: ec2-user

      - name: SSH into EC2 instance and run commands
        uses: appleboy/ssh-action@v1
        with:
          host: i-ec2-instance-id
          key_path: ${{ steps.ssh-connection.outputs.private-key-path }}
          script: whoami

      - name: Use any tool that requires SSH
        run: |
          ssh i-ec2-instance-id "ls -la"
          rsync -avz ./local-dir/ i-ec2-instance-id:/remote-dir/
```

## Required IAM Role Permissions

To use this action, the IAM role you are assuming must have the following
permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ssm:StartSession"],
      "Resource": [
        "arn:aws:ssm:*:*:document/AWS-StartSSHSession",
        "arn:aws:ec2:*:*:instance/i-ec2-instance-id"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ssm:*:*:document/AWS-RunShellScript",
        "arn:aws:ec2:*:*:instance/i-ec2-instance-id"
      ]
    }
  ]
}
```

<!-- prettier-ignore -->
> [!NOTE]
> Replace `i-ec2-instance-id` with the actual instance ID of your EC2 instance.

Your EC2 instance should also have an instance profile role that allows SSM connections. The easiest way is to make sure the role has the [AmazonSSMManagedInstanceCore](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AmazonSSMManagedInstanceCore.html) policy attached.

## Input Parameters

| Parameter       | Description                                        | Default    |
| --------------- | -------------------------------------------------- | ---------- |
| ec2-instance-id | The ID of the ec2 instance you want to connect to. |            |
| remote-user     | The user on the server to run commands             |            |
| ssh-port        | SSH port on the remote EC2 instance.               | 22         |
| region          | The region your ec2 instance is in.                | AWS_REGION |

You don't need to set the `region` parameter if your instance is in the same
region as the credential you are using in the
`aws-actions/configure-aws-credentials` step.

**The hostname for any SSH command should be the instance ID of your EC2
instance.**

## Outputs

| Output           | Description                                         |
| ---------------- | --------------------------------------------------- |
| private-key-path | The path to the private key for the SSH connection. |
