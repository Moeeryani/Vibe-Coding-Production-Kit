import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../tsconfig.json', import.meta.url), 'utf8'));
if (config?.compilerOptions?.strict !== true) {
  throw new Error('fixture requires compilerOptions.strict=true');
}
if (config?.compilerOptions?.noEmit !== true) {
  throw new Error('fixture requires compilerOptions.noEmit=true');
}
