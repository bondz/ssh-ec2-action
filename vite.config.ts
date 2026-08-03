import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    passWithNoTests: true,
    include: ['tests/**/*.test.ts'],
    typecheck: { tsconfig: './tsconfig.base.json' },
  },
  staged: {
    '*': 'vp check --fix',
  },
  lint: {
    plugins: ['oxc', 'typescript', 'unicorn', 'import'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    categories: {
      correctness: 'warn',
    },
    ignorePatterns: ['**/dist', '**/node_modules'],
  },
  fmt: {
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: true,
    trailingComma: 'all',
    bracketSpacing: true,
    arrowParens: 'always',
    endOfLine: 'lf',
    ignorePatterns: ['.DS_Store', '.licenses/', 'dist/', 'node_modules/'],
  },
});
