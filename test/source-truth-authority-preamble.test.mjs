import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSourceTruthAuthority } from '../lib/source-truth-authority.mjs';

test('authority examples below the document preamble do not become metadata', () => {
  const content = `# Freshness contract

Authority: ACCEPTED

Introductory text.

## Marker examples

\`\`\`text
Authority: DRAFT
Authority: ACCEPTED
Authority: SUPERSEDED
Authority: ARCHIVED
\`\`\`
`;

  assert.deepEqual(parseSourceTruthAuthority(content), {
    explicit: true,
    state: 'ACCEPTED',
    error: null
  });
});
