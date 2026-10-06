import { readFile } from 'node:fs/promises';

const files = ['src/app.js', 'app.json', 'tsconfig.json'];
for (const file of files) {
  const content = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  if (content.includes('\r')) throw new Error(`${file} contains CR/CRLF line endings`);
  if (!content.endsWith('\n')) throw new Error(`${file} must end with a newline`);
}
