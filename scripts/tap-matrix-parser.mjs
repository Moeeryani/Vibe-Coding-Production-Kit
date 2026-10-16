// TAP parser for the Windows writer matrix. Extracted from the runner so it
// can be unit-tested: an untested parser here silently dropped failing tests,
// which is the exact false-green class this tool exists to eliminate.
const OK_RE = /^\s*ok \d+ - (.+)$/;
const NOT_OK_RE = /^\s*not ok \d+ - (.+?)(?: \([\d.]+ms\))?\s*$/;
const COUNT_RE = /^# (tests|pass|fail) (\d+)/;
const ELLIPSIS_RE = /^\s*\.\.\.\s*$/;

export function classifyFailure(name, diagnostics) {
  if (diagnostics.includes('INCONCLUSIVE:') || diagnostics.includes('E_TEST_INCONCLUSIVE')) {
    return 'INCONCLUSIVE';
  }
  if (/# skip|NOT_PROVEN here|platform-specific/i.test(diagnostics)) return 'SKIPPED';
  return 'FAIL';
}

// Node's TAP reporter writes results on stdout and "# Subtest:" headers plus
// the summary on stderr. Callers commonly concatenate the two, so the parser
// must not treat a blank line as a block terminator.
export function parseTap({ stdout, stderr = '', suite }) {
  const text = `${stdout ?? ''}\n${stderr ?? ''}`;
  const rows = [];
  const declared = { tests: null, pass: null, fail: null };
  let sawSummary = false;
  let current = null;
  const flush = () => {
    if (!current) return;
    const detail = current.lines.join(' | ');
    rows.push({ suite: current.suite, name: current.name,
      verdict: classifyFailure(current.name, detail), detail: detail.slice(0, 300) });
    current = null;
  };
  for (const line of text.split(/\r?\n/)) {
    const count = line.match(COUNT_RE);
    if (count) { sawSummary = true; declared[count[1]] = Number(count[2]); continue; }
    if (/^# Subtest:/.test(line)) continue;
    const ok = line.match(OK_RE);
    const notOk = line.match(NOT_OK_RE);
    if (ok || notOk) {
      flush();
      if (ok) {
        // Directives are read from the raw line: node:test writes
        // "<name> # SKIP <reason>" / "# TODO <reason>" with no duration suffix,
        // and an earlier version of this parser misread those as PASS.
        const full = ok[1];
        const dir = full.match(/^(.*?)\s#\s(SKIP|TODO)\b/i);
        rows.push({ suite,
          name: (dir ? dir[1] : full).replace(/ \([\d.]+ms\)\s*$/, '').trim(),
          verdict: dir ? 'SKIPPED' : 'PASS', detail: dir ? full : '' });
      } else {
        current = { suite, name: notOk[1].trim(), lines: [] };
      }
      continue;
    }
    if (current && ELLIPSIS_RE.test(line)) { flush(); continue; }
    if (current && /^\s+\S/.test(line)) current.lines.push(line.trim());
  }
  flush();
  return { rows, declared, sawSummary };
}

// Compares parsed rows with the runner's own counts and reports a suite-level
// failure when they disagree. A parser that loses a test must fail loudly.
export function verifyCompleteness({ rows, declared, sawSummary, suite }) {
  if (!sawSummary || declared.tests === null) {
    return [{ suite, name: '(suite did not complete)', verdict: 'INCONCLUSIVE',
      detail: 'TAP summary missing' }];
  }
  const suiteRows = rows.filter((r) => r.suite === suite);
  const nonPass = suiteRows.filter((r) => r.verdict === 'FAIL' || r.verdict === 'INCONCLUSIVE').length;
  if (suiteRows.length !== declared.tests || nonPass !== declared.fail) {
    return [{ suite, name: '(matrix parser disagreement)', verdict: 'FAIL',
      detail: `parsed ${suiteRows.length}/${declared.tests} tests, ${nonPass} non-pass` +
              ` vs runner fail=${declared.fail}` }];
  }
  return [];
}
