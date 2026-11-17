# P5 Integration Purpose

**Line:** `fix/p5-review-findings` at `f5fa129` (validated; published for review).
**Status:** D-01 DEFERRED, G-FENCE NO_GO, production writers DISABLED, release NO_GO, B-2 NOT_PROVEN.
**Written:** 2026-11-17, owner-delegated decision (review pack §10 item 5).

## The question

What is integrating the P4/P5 line *for*, given that the live CLI rollback is
untouched (`rollbackV2` is not wired into `vcp rollback`) and production
writers stay disabled? Integrating changes nothing a user can run. So why
land it instead of leaving it as a review branch forever?

## The answer

Integration adopts the hardened dormancy layer as the foundation for the
next step — nothing more, nothing less.

What lands:

- The journal is atomic at creation (PH-06 creation race closed) and the
  transition commit reports accurately when the root is replaced
  mid-transition (R-INT-8 / F-P5V-2).
- The dormant v2 rollback refuses before destroying unaccounted edits, and
  its receipt flags skipped backup entries (R-INT-10 / F-P5V-3).
- Legacy recovery fails closed with a manual runbook (OD-4), now in the repo
  at `docs/runbooks/legacy-recovery-manual-runbook.md`.
- The decision record is straight: D-03 says ACCEPTED (it is), and the six
  anchor maps for the ACCEPTED decisions (D-02/03/04/05/06/12) are
  maintainer-reviewed (OD-2 executed).

What does NOT change:

- No user-facing behavior. The CLI still calls the frozen v1 rollback; the
  v2 update path (the population point for `postApplyFiles`) does not exist
  yet.
- No gate moves. D-01 stays DEFERRED, G-FENCE stays NO_GO, production
  writers stay DISABLED, B-2 stays NOT_PROVEN.
- No release. Version **0.9.4 stays the declared development version for
  this line; no release, tag, or npm publication is made by this
  integration** (review pack §10 item 6, decided explicitly).

Why land it now: the next authorized work — wiring `rollbackV2` into the CLI
and building the v2 update path — then builds on verified, reviewed code
that is in the tree, instead of on a review branch that drifts further from
main with every month. Integration is a foundation step, not an activation
step. Activation (D-01 GO / G-FENCE opening / production writers) remains a
separate decision that has not been requested or granted.
