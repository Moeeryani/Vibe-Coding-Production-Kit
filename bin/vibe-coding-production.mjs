#!/usr/bin/env node
import { runCli } from '../lib/cli.mjs';

const args = process.argv.slice(2);
const blankGitOption = args.find((arg) => (
  (arg.startsWith('--base=') && !arg.slice('--base='.length).trim())
  || (arg.startsWith('--head=') && !arg.slice('--head='.length).trim())
));

if (blankGitOption) {
  console.error(`\nError: ${blankGitOption.startsWith('--base=') ? '--base' : '--head'} requires a value.`);
  process.exitCode = 1;
} else {
  runCli(args).catch((error) => {
    console.error(`\nError: ${error.message}`);
    process.exitCode = 1;
  });
}
