# Interim Adaptive VCP gates without GitHub Actions (PROPOSED contract)

**Context:** In this repository's current account, GitHub Actions is unavailable/unreliable. GitHub check failures or absent checks **cannot** be presented as a valid pass. This policy is a proposal for maintaining review discipline until a trusted independent gate exists; the D-06 architectural decision remains PROPOSED.

## Adopt a maintainer-run local gate, not a fake required CI check

The default interim mechanism is **manual exact-HEAD local execution with machine-readable receipts**, combined with maintainer review before merging. A local pre-push hook may be added later for convenience, but cannot enforce a server merge: it can be skipped with `--no-verify`, not installed, edited or bypassed through the GitHub UI. No hook should be advertised as tamperproof.

1. Agent/author fetches the PR and checks out its **full final head SHA** in a fresh, clean checkout. Capture the current base SHA and exact PR head independently from GitHub (not from a self-authored receipt).
2. From the repo checkout, run the following after choosing a **new absolute evidence directory outside the checkout**:

```bash
node scripts/run-adaptive-local-gates.mjs --expected-sha <40-character-PR-head-SHA> --evidence-dir /absolute/new/evidence/directory
```

On Windows native PowerShell, use an absolute path such as `D:\vcp-evidence\pr-90-unique-run`; the directory must **not already exist**. Avoid an evidence path nested under the checkout.

3. The runner refuses a wrong HEAD, dirty source tree, nonabsolute/in-repository evidence path, or reused evidence directory. It performs the offline canonical decision/doc guard, `npm ci`, `npm run validate`, and `npm run pack:check`. It saves full per-step stdout/stderr, real exit code, tested SHA, OS/runtime metadata, and post-run Git state. Each failure makes the receipt FAIL. Do not hide a failing `npm` command with shell pipes.
4. Inspect the JSON and **each raw log**. Post a compact nonsecret evidence index or securely accessible log reference to the PR including tester platform, exact SHA, receipt location/digest, command exit codes and changes. Never commit raw logs containing secrets or personal machine paths.
5. If any PR branch commit changes after validation, **repeat everything at the new final SHA**. Each stacked PR needs its own final-head receipt before its merge; no borrowing parent PR receipts. Before merge, maintainer compares the documented tested SHA with GitHub's actual PR head and explicitly records PASS/FAIL/UNVERIFIED; no auto-merge from an uploaded receipt.
6. When an exact post-finalization-head rerun is required, run the same script **again** at that finalization HEAD, and explicitly record review-head versus finalization-head differences. Unavailable Windows tests remain UNVERIFIED; a Linux receipt never counts as Windows evidence.

## Scope of local static guard

**D-06 (PROPOSED):** The canonical decision policy requires an independent, maintainer-reviewed complete location inventory plus an exact-head local receipt and maintainer inspection; local receipts are cooperative evidence, never trusted remote enforcement or automatic decision approval.

`node scripts/check-adaptive-contracts.mjs` enforces unique registered D-01–D-12 IDs and 14 **focused regression anchors** in both strategic S and technical T. These 14 tokens are a safety net, **not** a complete proof that all C-01–C-14 correction semantics are accepted. Only when an ID is set to ACCEPTED in the canonical Markdown register does the guard require a corresponding machine-readable `docs/decisions/D-XX.json` record with named owner, UTC date, chosen option, rationale, evidence IDs, PR URL and exact section-anchored affected locations. It verifies affected location sections on disk. Decisions remain in their explicit canonical states (PROPOSED, ACCEPTED, DEFERRED or REJECTED); the guard never promotes a status or turns a deferral into pending approval. The accepted record also requires an explicit maintainer approval reference and rejected-alternative rationales.

**Proposed acceptance JSON shape** (for future acceptance only; do not create it to infer signoff):

```json
{
  "id": "D-XX",
  "status": "ACCEPTED",
  "owner": "actual-maintainer",
  "decidedAtUtc": "2026-10-09T00:00:00Z",
  "chosenOption": "specific accepted contract",
  "approvalEvidence": "reference to explicit human sign-off (not a passing test)",
  "rejectedAlternatives": [{ "option": "another considered choice", "reason": "why rejected" }],
  "rationale": "recorded decision rationale",
  "implementationPR": "https://github.com/owner/repo/pull/number",
  "provingTests": ["named-test-and-receipt-ID"],
  "affectedLocations": [{
    "path": "docs/ADAPTIVE-VCP-IMPLEMENTATION-PLAN.md",
    "heading": "## exact markdown heading",
    "requiredText": "specific accepted requirement"
  }]
}
```

The acceptance record must match the Markdown register status; the JSON is *evidence of an acceptance already decided by a maintainer*, not a second decision authority. Historical S Appendix Z and T Appendix Z have independent rows and are not required to match.

## Independent accepted-decision completeness review

The focused C-01–C-14 token anchors cannot determine whether an accepted decision omitted a normative location. The separate versioned inventory `docs/decisions/required-anchors.json` lists **38 draft section-level anchors across seven Stage12-relevant decisions (D-01–D-06, D-12)** on the current integration candidate (D-01: 6, D-02: 5, D-03: 7, D-04: 4, D-05: 4, D-06: 6, D-12: 6). They cover S/T, Stage12 Task Pack, ROADMAP, CLI, UPDATES and this local-gates policy. This count is a **branch-level, unapproved inventory**; PR #90 alone retains its earlier 23-anchor snapshot. They do **not** automatically prove that every affected Roadmap/CLI/Task location was discovered; this is a **draft coverage inventory pending maintainer review**.

Before any acceptance record is created, the reviewer must (1) audit the source-to-destination coverage, adding missing Roadmap/CLI/Task anchors or explicit applicability rationale; (2) explicitly switch that decision's `coverageReview` from `PENDING` to `APPROVED` only after documentary review; (3) record actual selected/rejected options, reviewer, UTC, evidence and location references in the canonical ledger; and (4) re-run all guard tests and local gates against the resulting exact final SHA. `check-adaptive-contracts.mjs` now rejects a decision marked ACCEPTED whenever its independent map is absent, unreviewed, or a required location is omitted from the accepted record; the record cannot redefine its own expected clause. D-07–D-11 lack approved inventories and intentionally fail closed if prematurely set ACCEPTED.

The map itself is code-reviewable governance configuration, not a self-authenticating third-party authority. A maintainer must separately review its completeness and any changes to `coverageReview`. **No recorded decision is made ACCEPTED just by adding the inventory.**

## Three boundaries that must not be conflated

| Boundary | Interim status | Meaning |
|---|---|---|
| **Local code/doc tests** | Can be checked manually at exact HEAD | Evidence that a specified checkout's commands ran and exited as recorded; not independently attested |
| **Maintainer-controlled merge review** | **Manual review obligation** | Maintainer checks current PR SHA, raw outputs, decisions, scope and no unresolved MUST-FIX; bypass remains technically possible without external branch controls |
| **Trusted remote merge gate / Phase 8** | **NOT IMPLEMENTED / BLOCKED** | Requires independently controlled platform integration and branch/ruleset protection; local hook/receipt cannot substitute |

**D-01 G-FENCE stays NO-GO** until actual published 0.9.3 adversarial tests are validated across the required platforms, including concurrency/crash/atomic transition. Static doc anchors, local npm success and the POC harness do not prove a lock fence.

## Adoption/release rule

Until external enforcement exists, do not claim 'CI verified' or 'merge mechanically protected'. Record `LOCAL-RECEIPT REVIEWED` (with exact SHA/OS and limitations) instead. Product release that requires a mandatory remote gate or trusted CI remains blocked unless the maintainer explicitly approves a concrete alternative platform satisfying that exact requirement. **No reduction of security guarantees is implied.**
