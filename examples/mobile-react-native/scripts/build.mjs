import { readFile } from 'node:fs/promises';

const app = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
if (app?.name !== 'VcpMobileFixture') throw new Error('unexpected fixture app identity');
if (!source.includes('platformGreeting')) throw new Error('fixture source contract missing');
console.log('fixture build contract ok');
