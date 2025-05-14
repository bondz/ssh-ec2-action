import type * as core from '@actions/core'
import { vi } from 'vitest'

export const debug = vi.fn<typeof core.debug>()
export const error = vi.fn<typeof core.error>()
export const info = vi.fn<typeof core.info>()
export const getInput = vi.fn<typeof core.getInput>()
export const setOutput = vi.fn<typeof core.setOutput>()
export const startGroup = vi.fn<typeof core.startGroup>()
export const endGroup = vi.fn<typeof core.endGroup>()
export const setFailed = vi.fn<typeof core.setFailed>()
export const saveState = vi.fn<typeof core.saveState>()
export const warning = vi.fn<typeof core.warning>()
