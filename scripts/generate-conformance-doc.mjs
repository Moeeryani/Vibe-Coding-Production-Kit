// Generate docs/VCP-ADAPTIVE-CONFORMANCE-MATRIX.md from lib/conformance-matrix.mjs.
// The module is the single source of truth: every count, row, and status here
// is derived from it, never hardcoded. This script exists because the original
// Phase 10 doc was produced by a one-off script that was never committed, and
// that script had two defects the committed doc inherited: lowercase summary
// keys (rendering "COVERED undefined") and unescaped backticks (rendering
// empty code spans for the module path and test files). Those defects are why
// the doc's own "cannot drift" claim was false for its header and footer.
// Regenerate with: node scripts/generate-conformance-doc.mjs
// The matrix test fails if the committed doc differs from this output.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFORMANCE_MATRIX, conformanceSummary } from '../lib/conformance-matrix.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC_PATH = path.join(packageRoot, 'docs', 'VCP-ADAPTIVE-CONFORMANCE-MATRIX.md');

export function generateConformanceDoc() {
  const summary = conformanceSummary();
  const lines = [];
  lines.push('# Adaptive Phase 10 — Conformance Matrix');
  lines.push('');
  lines.push(`**Status: SOURCE COMPLETE, NOT ACCEPTED.** This matrix is generated from \`lib/conformance-matrix.mjs\` (the single source of truth) so the doc cannot drift from the validated data. It records what has in-tree test evidence, what is partial, and what is explicitly unresolved. It cannot express overall acceptance: the status vocabulary has no ACCEPTED value, and overall conformance acceptance and production readiness remain separate owner decisions backed by independent evidence that does not exist yet.`);
  lines.push('');
  lines.push(`Rows: ${summary.total} — COVERED ${summary.COVERED}, PARTIAL ${summary.PARTIAL}, UNRESOLVED ${summary.UNRESOLVED}. Acceptance claimed: ${summary.acceptanceClaimed}.`);
  lines.push('');
  lines.push('| ID | Area | Requirement | Evidence | Status | Notes |');
  lines.push('|---|---|---|---|---|---|');
  for (const row of CONFORMANCE_MATRIX) {
    const evidence = row.evidence.length ? row.evidence.join('; ') : '—';
    lines.push(`| ${row.id} | ${row.area} | ${row.requirement} | ${evidence} | ${row.status} | ${row.notes} |`);
  }
  lines.push('');
  lines.push('## Reading the unresolved rows');
  lines.push('');
  lines.push('Every UNRESOLVED row names the owner decision or campaign that would close it. Until those exist, mandatory CI enforcement stays disabled, production writers stay disabled, and no tag, release, or npm publish follows from construction work.');
  lines.push('');
  lines.push('## How this matrix is enforced');
  lines.push('');
  lines.push('- \`lib/conformance-matrix.mjs\` validates structure, evidence-file existence, unresolved-blocker naming, and that the doc contains every row id.');
  lines.push('- \`test/conformance-matrix.test.mjs\` proves the generated doc matches the module exactly: row identities, requirement text, header counts, and the source-module and test-file references.');
  lines.push('- \`test/conformance-fixtures.test.mjs\` proves cross-batch composition on disposable fresh and brownfield projects.');
  lines.push('- \`scripts/generate-conformance-doc.mjs\` is the single generator; it derives every count and row from \`lib/conformance-matrix.mjs\`. Regenerate after any matrix change, in the same commit.');
  lines.push('- The matrix module rejects any status outside COVERED / PARTIAL / UNRESOLVED at validation time.');
  return lines.join('\n') + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeFile(DOC_PATH, generateConformanceDoc(), 'utf8');
  console.log(`wrote ${DOC_PATH}`);
}
