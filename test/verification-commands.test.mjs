import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseAgentVerificationCommands,
  parseTaskVerificationCommands
} from '../lib/verification-commands.mjs';

test('agent verification parser includes project check and excludes reasoned non-applicable values', () => {
  const commands = parseAgentVerificationCommands([
    'INSTALL_COMMAND=npm install',
    'FORMAT_CHECK_COMMAND=n/a — no formatter configured',
    'LINT_COMMAND=n/a — no linter configured',
    'TYPECHECK_COMMAND=n/a - plain JavaScript',
    'CHECK_COMMAND=npm run check',
    'UNIT_TEST_COMMAND=npm test',
    'INTEGRATION_TEST_COMMAND=not applicable — no integrations',
    'BUILD_COMMAND=n/a — no build step',
    'E2E_COMMAND=n/a — no UI'
  ].join('\n'));

  assert.deepEqual(commands, [
    { key: 'INSTALL_COMMAND', value: 'npm install' },
    { key: 'CHECK_COMMAND', value: 'npm run check' },
    { key: 'UNIT_TEST_COMMAND', value: 'npm test' }
  ]);
});

test('task verification parser includes arbitrary configured keys and excludes reasoned non-applicable values', () => {
  const task = `# Task — Parser regression\n\n## Verification commands\n\n- \`LINT_COMMAND\`: \`n/a — no linter\`\n- \`TYPECHECK_COMMAND\`: \`n/a — plain JavaScript\`\n- \`CHECK_COMMAND\`: \`npm run check\`\n- \`UNIT_TEST_COMMAND\`: \`npm test\`\n- \`BUILD_COMMAND\`: \`not applicable — no build step\`\n`;

  assert.deepEqual(parseTaskVerificationCommands(task), [
    { key: 'CHECK_COMMAND', command: 'npm run check' },
    { key: 'UNIT_TEST_COMMAND', command: 'npm test' }
  ]);
});
