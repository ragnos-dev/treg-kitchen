import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('public', { recursive: true });
await copyFile('SKILL.md', 'public/SKILL.md');
await copyFile('lib/recipe.js', 'public/recipe-format.js');
await copyFile('lib/example.js', 'public/example.js');
