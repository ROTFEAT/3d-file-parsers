import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/parsers/m3d.ts',
    'src/parsers/x3d.ts',
    'src/parsers/irrmesh.ts',
    'src/parsers/terragen.ts',
    'src/parsers/pts.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  treeshake: true,
  minify: false,
});
