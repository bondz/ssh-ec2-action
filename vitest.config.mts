import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    passWithNoTests: true,
    include: ['tests/**/*.test.ts'],
    coverage: { enabled: true },
    typecheck: { tsconfig: './tsconfig.base.json' }
  }
})
