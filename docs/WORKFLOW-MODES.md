# Workflow modes: Manual, Assisted, Auto (D-PC-03)

VCP workflows move a Task Pack through four phases — **plan, implement,
review, release** — using the same contracts in every mode: Task Pack
readiness, bounded context packs, the mechanical gate, and release evidence.
The mode changes **who decides the next step and whether confirmation is
required**. It never changes what is authorized: nothing in any mode merges,
pushes, publishes, deploys, activates production, creates a human approval,
or bypasses command authority.

## Manual

You pick each step. VCP shows every available next step, the evidence each
one needs, and the current blockers; it executes only the step you authorize,
in order.

```sh
vcp workflow my-task --workflow-mode manual --workflow-phase plan
```

Use Manual when you want full control, or when you are learning the workflow.
Skipping ahead is refused: a later step cannot be authorized before the
step it depends on completes.

## Assisted

VCP recommends exactly one next step from the deterministic project state,
explains why (what it will check, what evidence exists, what blocks), and
asks for confirmation before advancing.

```sh
vcp workflow my-task --workflow-mode assisted --workflow-phase plan
```

Use Assisted for the normal day-to-day flow: you stay in charge, but you do
not have to remember the step order. Declining a recommendation pauses the
session without executing anything.

## Auto

A connected coding agent can let VCP advance through ordinary, low-risk
transitions without confirming every step. Auto still stops — it never
improvises — when:

- a readiness or verification check fails;
- evidence is stale or the project state changed (dirty worktree, moved Git
  head, changed Task Pack);
- the change is L3 (independent review is required, and live L3
  authorization is disabled);
- an approval or authorization receipt is required and missing (the
  mechanical gate enforces command authority);
- the intent is unclear (for example, the task cannot be read).

```sh
vcp workflow my-task --workflow-mode auto --base <base-ref>
```

Auto automates **workflow progression, not code authorship**. At the
implement phase it hands the readiness and context evidence to the coding
agent, pauses as `AWAITING_IMPLEMENTATION`, and resumes deterministically
at gate evidence once the change is committed. Every step is recorded in a
visible transcript with its outcome and blockers.

## Sessions: resumable, session-scoped

A workflow run is a **session**: an id, the task, the mode, completed steps,
the transcript, and blockers. Sessions do not change the project: VCP writes
no session files into the project and no project files at all (context packs
are generated in memory; the only project effects are the gate's authorized
verification commands).

Pass `--session-file <path>` to keep a session across runs:

```sh
vcp workflow my-task --workflow-mode auto --base <base-ref> --session-file /tmp/my-task.json
```

Re-running with the same file resumes completed work instead of repeating
it — except gate steps, which always re-execute on resume (see below). Switching modes mid-session is explicit and recorded
(`--workflow-mode` on a resumed session). Stopping is explicit too: decline
a confirmation, or stop the run — completed steps and blockers are preserved
in the session.

**Session files are local, user-controlled state — not authorization
receipts, and not verification evidence.** A session file can be
hand-edited, so a stored completion claim never proves a gate ran or
passed — not even when its recorded task and Git HEAD match the
current ones, because the file itself supplies every compared value.
On every resumed run, completed gate claims (`gate-evidence`,
`gate-preview`) are dropped — together with later steps that depended
on them — and the gate re-executes against independently read current
state: working-tree cleanliness, current HEAD, changed-file
classification, the current Task Pack and readiness requirements, and
L3 restrictions, through the canonical gate readers under the
established command-authority protections. The recorded task/HEAD
binding is kept only to classify the dropped claim in the audit
transcript (a stale, mismatched, or unbound claim is recorded as
rejected; a well-formed claim is recorded as revalidated by
re-execution). Stored gate status, level, timestamps, approvals, and
blocking reasons are never consulted as proof of a live verification,
and current gate evidence is replaced only by a genuinely observed
result from the new run. Non-gate completed work (readiness, context,
handoff) carries no verification claim and is still resumed without
repetition. A session file can never create an approval, bypass the
gate, or authorize anything: gate outcomes are evidence only, L3
remains blocked, and a saved session's COMPLETED status is historical
record, not current proof.

**Blocked steps explain themselves — current blockers only.**
When a run stops on a blocked step, the session records the blocked
step with its underlying evidence — the gate's blocking reasons, the
failed readiness checks, or the review-validation reasons — in
`blockedSteps` and in the transcript, and the CLI prints the reason
line. `blockedSteps` and `blockers` describe the most recent run
only: each new run clears them and repopulates them if it blocks, so
a later COMPLETED run carries no active blockers and the CLI shows
no obsolete blocking reasons. The transcript is never cleared and
remains the audit history of every blocking event, including ones
superseded by a later completion.

**Durable mode persistence is not implemented.** The lifecycle manifest
schema does not record `workflowMode`, and extending it would be a lifecycle
contract change requiring an owner decision (adjacent to the D-01/G-FENCE
boundaries). Mode is therefore session-scoped only; each new session starts
in Manual unless `--workflow-mode` says otherwise. This is a separately
blocked requirement, not a silent default.

## Read-only preview

`vcp workflow-preview` lists the steps for a phase without executing
anything, in any mode. Use it to see the route before committing to a run.

## What Auto will never do

- Merge, push, publish, deploy, or activate production.
- Create human approvals or infer a HUMAN DECISION.
- Run hidden commands: every executed step appears in the transcript, and
  verification commands run only inside the mechanical gate under Task Pack
  command authority.
- Treat gate evidence as approval: the best outcome of any workflow run is
  collected evidence and a completed progression, never authorization.
