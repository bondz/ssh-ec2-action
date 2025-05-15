import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as core from '../__fixtures__/core.js'
import { mockClient } from 'aws-sdk-client-mock'
import { SendCommandCommand, SSMClient } from '@aws-sdk/client-ssm'
import mocks from './mock.test'
import { run } from '../src/index'

const mockedSSMClient = mockClient(SSMClient)

// Mocks should be declared before the module being tested is imported.
vi.mock('@actions/core', () => core)

describe('main.ts', {}, () => {
  beforeEach(() => {
    // Reset mock state
    vi.restoreAllMocks()
    mockedSSMClient.reset()

    // Remove any existing environment variables before each test to prevent the
    // SDK from picking them up
    process.env = { ...mocks.envs }
  })

  describe('run', {}, () => {
    beforeEach(() => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput(mocks.TEST_INPUTS)
      )
      mockedSSMClient
        .on(SendCommandCommand)
        .resolvesOnce(mocks.outputs.UPDATE_SSM_DOCUMENT)
    })

    it('should run successfully', async () => {
      await run()

      expect(core.info).toHaveBeenCalled()
    })
  })
})
