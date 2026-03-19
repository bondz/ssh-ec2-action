import { build } from 'vite-plus';

const entries = [
  { input: 'src/index.ts', dir: 'dist', file: 'index.js' },
  { input: 'src/cleanup/index.ts', dir: 'dist/cleanup', file: 'index.js' },
];

for (const entry of entries) {
  await build({
    ssr: { noExternal: true },
    build: {
      target: 'node24',
      ssr: true,
      minify: true,
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
