import { build } from 'vite-plus';

const entries = [
  { input: 'src/index.ts', dir: 'dist', file: 'index.js' },
  { input: 'src/proxy.ts', dir: 'dist', file: 'proxy.js' },
];

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
