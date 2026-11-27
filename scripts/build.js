import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('public', { recursive: true });
await copyFile('SKILL.md', 'public/SKILL.md');
await copyFile('lib/recipe.js', 'public/recipe-format.js');
await copyFile('lib/example.js', 'public/example.js');

const { build } = await import('esbuild');
await build({
  entryPoints: ['ui/recipe-path.jsx'], outfile: 'public/recipe-path.js', bundle: true,
  format: 'esm', minify: true, jsx: 'automatic', target: 'es2020',
  alias: { '@/lib/utils': './ui/classes.js' },
  define: { 'process.env.NODE_ENV': '"production"' },
});
