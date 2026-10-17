// TAP parser for the Windows writer matrix. Extracted from the runner so it
// can be unit-tested: an untested parser here silently dropped failing tests,
// which is the exact false-green class this tool exists to eliminate.
const OK_RE = /^\s*ok \d+ - (.+)$/;
const NOT_OK_RE = /^\s*not ok \d+ - (.+?)(?: \([\d.]+ms\))?\s*$/;
const COUNT_RE = /^# (tests|pass|fail) (\d+)/;
const ELLIPSIS_RE = /^\s*\.\.\.\s*$/;

// INCONCLUSIVE / SKIPPED must be claimed by the test's own error fields, never
// merely mentioned anywhere in the block. The previous version did
// `diagnostics.includes('INCONCLUSIVE:')` over the whole joined diagnostic, so a
// genuine FAIL whose assertion diff QUOTED an inconclusive message was reported
// as INCONCLUSIVE, and a message containing the words "platform-specific" became
// a SKIP. Both are silent downgrades of a real failure, and verifyCompleteness
// cannot see them because the non-pass count still matches.
//
// Classification reads anchored lines only — `code:`, `error:`, `message:`,
// `reason:` — and defaults to FAIL. Anything it cannot positively identify as
// guard-blocked is a failure. Unparseable input therefore lands on the safe side.
const INCONCLUSIVE_CODE = /^\s*code:\s*['"]?E_TEST_INCONCLUSIVE['"]?\s*$/;
const INCONCLUSIVE_FIELD = /^\s*(?:error|message|reason):\s*['"]?INCONCLUSIVE:/i;
// A skip is a TAP directive (`# SKIP`), which parseTap reads from the `ok` line
// itself; a failing test is never a skip, whatever its text contains.

export function classifyFailure(name, diagnostics) {
  const lines = String(diagnostics ?? '').split(' | ');
  for (const line of lines) {
    if (INCONCLUSIVE_CODE.test(line) || INCONCLUSIVE_FIELD.test(line)) return 'INCONCLUSIVE';
  }
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
    // Classify the FULL block; `detail` is truncated only for display. A 300-char
    // cut used to be able to amputate the `code:` line and turn a guard-blocked
    // test into a FAIL — fail-closed, but wrong, and it made the matrix disagree
    // with itself on long messages.
    const full = current.lines.join(' | ');
    rows.push({ suite: current.suite, name: current.name,
      verdict: classifyFailure(current.name, full), detail: full.slice(0, 400) });
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
