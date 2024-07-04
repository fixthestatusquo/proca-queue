// const esbuild = require('esbuild');
import esbuild from 'esbuild';

esbuild
  .build({
    entryPoints: ['src/index.ts'],
    outfile: 'dist/index.cjs',
    bundle: true,
    format: 'cjs',
    minify: false,
    platform: 'node',
  })
  .catch(() => process.exit(1));

esbuild
  .build({
    entryPoints: ['src/index.ts'],
    outfile: 'dist/index.mjs',
    format: 'esm',
    bundle: true,
    minify: false,
    platform: 'node',
  })
  .catch(() => process.exit(1));
