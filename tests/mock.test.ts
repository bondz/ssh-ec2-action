import type * as core from '@actions/core'

const inputs = {
  TEST_INPUTS: {
    'ec2-instance-id': 'i-1234567890abcdef0',
    'remote-user': 'fake-user',
    'aws-region': 'fake-region-1'
  }
}

const outputs = {
  UPDATE_SSM_DOCUMENT: {
    Command: {
      CommandId: 'fake-command-id'
    }
  }
}

const envs = {
  GITHUB_RUN_ID: 'MY-RUN-ID'
}

export default {
  getInput: (fakeEnv: Record<string, string>) => {
    return (name: string, options?: core.InputOptions): string => {
      if (!fakeEnv[name]) {
        if (options?.required) throw new Error(`Input ${name} not found`)
        return ''
      }
      return fakeEnv[name]
    }
  },
  getMultilineInput: (fakeEnv: Record<string, string[]>) => {
    return (name: string, options?: core.InputOptions): string[] => {
      if (!fakeEnv[name]) {
        if (options?.required) throw new Error(`Input ${name} not found`)
        return []
      }
      return fakeEnv[name]
    }
  },
  ...inputs,
  outputs,
  envs
} as const
