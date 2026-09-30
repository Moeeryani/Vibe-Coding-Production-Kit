import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { renderTaskPack } from '../lib/task.mjs';

const referenceRoot = new URL('../examples/reference-saas-invite/', import.meta.url);

test('generated Task Packs define a bounded finalization contract', () => {
  const task = renderTaskPack({
    slug: 'finalize-example',
    title: 'Finalize example',
    commands: [
      { key: 'CHECK_COMMAND', value: 'npm run check' },
      { key: 'UNIT_TEST_COMMAND', value: 'npm test' }
    ]
  });

  assert.match(task, /## Finalization/);
  assert.match(task, /`Status: Done` is the durable final state/);
  assert.match(task, /required verification command has actually passed on the current final head/);
  assert.match(task, /earlier failed gate is materially useful, summarize it separately as superseded evidence/);
  assert.match(task, /Git\/PR history owns merge identity/);
  assert.match(task, /Final accepted verification: pending — replace before setting `Status: Done`/);
  assert.match(task, /Superseded failed evidence \(if material\): n\/a/);
});

test('Slice C dogfood tasks are finalized without stale pending verification text', async () => {
  const repositoryTask = await readFile(
    new URL('docs/tasks/list-invitations-by-organization-repository.md', referenceRoot),
    'utf8'
  );
  const listingTask = await readFile(
    new URL('docs/tasks/list-active-invitations.md', referenceRoot),
    'utf8'
  );

  for (const task of [repositoryTask, listingTask]) {
    assert.match(task, /^Status: Done$/m);
    assert.match(task, /## Finalization/);
    assert.match(task, /Final accepted verification:/);
    assert.doesNotMatch(task, /Verification actually run: pending/);
    assert.doesNotMatch(task, /Independent review evidence updated: pending/);
  }

  assert.match(listingTask, /readiness passed 15\/15/);
  assert.match(listingTask, /full framework validation passed 175\/175/);
  assert.match(listingTask, /earlier PR #47 heads failed Task Pack readiness/);
  assert.match(listingTask, /superseded by the final accepted gate above/);
});
