import { build } from 'vite-plus';
import { rm } from 'node:fs/promises';

const entries = [
  { input: 'src/index.ts', dir: 'dist', file: 'index.js' },
  { input: 'src/proxy.ts', dir: 'dist', file: 'proxy.js' },
];

await rm('dist', { recursive: true, force: true });

for (const entry of entries) {
  await build({
    ssr: { noExternal: true },
    build: {
      target: 'node24',
      ssr: true,
      minify: true,
      emptyOutDir: false,
      rolldownOptions: {
        input: entry.input,
        output: {
          dir: entry.dir,
          entryFileNames: entry.file,
          format: 'esm',
          codeSplitting: false,
        },
      },
    },
    logLevel: 'info',
  });
}
