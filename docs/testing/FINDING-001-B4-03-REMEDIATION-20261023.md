# FINDING-001 remediation — B4-03 post-mutation re-verification

Status: **AUTHORED AND EXECUTED ON LINUX. NOT A NATIVE-WINDOWS RECEIPT.**
This document records a review finding, its root cause, the repair, and the
evidence for the repair. It is engineering evidence, not a maintainer decision,
not an acceptance receipt, and not a G-FENCE GO.

## Context

The independent Linux validation agent returned **LINUX_VALIDATION_PARTIAL** for
the frozen candidate `690138ee4655e8295564faeaf3a5294490ef5362`
(branch `validation/stage12-stage13-mw-candidate-690138ee`).

The reported defect, FINDING-001:

> `guardsBefore` in **B4-03** contains `G_FENCE`, although the layer order
> places `G_FENCE` after `CAPABILITY`.

Confirmed on the candidate, before any change: `B4-03` failed on Linux with
the harness error `guardsBefore must all precede the intended layer:
E_TEST_CAPABILITY_IDENTITY`. The detector did not run at all — the claim was
self-inconsistent, so the scenario proved nothing.

## Root cause

Two independent errors, both in the *claim*, not in the product:

1. **The layer model did not match the real execution path.** Step 2 of
   `runWriterTransaction` is a **choice**, not a sequence:

   ```js
   if (testCapability) await verifyTestCapability(...);   // controlled lane
   else               authorizeV2Operation();            // production lane (G-FENCE)
   ```

   A controlled test capability **replaces** the G-FENCE gate; it does not run
   after it. The G-FENCE gate therefore never executes in the controlled lane
   and cannot preempt anything. The old layer order listed `G_FENCE` as a link
   *after* `CAPABILITY`, which is a factually wrong chain, and `B4-03` then
   listed it among the guards before the intended layer.

2. **The layer under test was misnamed.** `B4-03` claims the *step-5b*
   post-mutation re-verification, but the layer table had a single
   `CAPABILITY` entry, which points at the **step-2** authorization check. Both
   sites raise `E_TEST_CAPABILITY_IDENTITY`, so the code identity could not
   locate the executing layer, and a refusal raised by the *initial* capability
   check was indistinguishable from a step-5b refusal.

## The repair

| File | Change |
|---|---|
| `test/helpers/writer-layers.mjs` | The controlled lane's chain is now `LAYER_ORDER` (boundary → the three capability checks → durability → principal → B-9 identity pin → **step 5b**). `G_FENCE` moved out of the chain into `LAYER_PRODUCTION_BRANCH`: it is step 2's production *alternative*. New layer `CAPABILITY_REVERIFY` = `E_TEST_CAPABILITY_REVERIFY` = step 5b. |
| `test/helpers/layer-assertion.mjs` | `requireLayer` now **refuses** a production-branch layer in `guardsBefore`, with an explanation, instead of tolerating it. The FINDING-001 class of claim can no longer be written. |
| `lib/production-writer.mjs` | Step 5b keeps its gate exactly as it was — same verifier, same position, still before the evidence write, still fail-closed — and now raises `E_TEST_CAPABILITY_REVERIFY` instead of the step-2 code, preserving the original error as `cause`. No gate was reordered, disabled, or made weaker. |
| `test/helpers/post-mutation-reverify.mjs` (new) | The B4-03 scenario, factored out so the scenario test and the mutation test cannot drift apart. |
| `test/helpers/remove-post-mutation-reverify-loader.mjs` (new) | ESM loader that removes the step-5b block **in memory**. The working tree is never patched. Fail-closed: a block that is not found means the mutation is not applied, and the probe says so. |
| `test/helpers/post-mutation-reverify-mutant.mjs` (new) | The mutation probe. `MUTATION_KILLED` / `MUTATION_SURVIVED` / `MUTATION_NOT_APPLIED` / `MUTATION_INCONCLUSIVE` are distinct outcomes. It requires an explicit `probe` mode argument, because the test runner executes every file under `test/` as a test file and the probe must not register its loader by accident. |
| `test/writer-post-mutation-reverify.test.mjs` (new) | PMR-01 regression, PMR-02 initial-check rejection, PMR-03 mutation, PMR-04 single enforcement site. |
| `test/writer-controlled-concurrency.test.mjs` | B4-03 now claims `LAYER.CAPABILITY_REVERIFY` with the controlled lane's real guards. The test count of the file is unchanged (7), so the Phase-D stability declaration still holds. |
| `test/writer-layer-assertion.test.mjs` | LA-07 updated to the new chain; **LA-11** is the FINDING-001 regression. |
| `test/writer-layer-reachability.test.mjs` | B-09 keeps its attack and adds the production-branch padding case. |
| `test/writer-parent-namespace.test.mjs` | B9-01b's `guardsBefore` no longer contains `G_FENCE` (see below). The verdict is unchanged: INCONCLUSIVE. |
| `test/no-replace-capability.test.mjs` | NRC-04 and NRC-06 repaired (see below). |
| `test/writer-identity.test.mjs` | WIN-02 given an explicit, measured platform skip plus a proof test (see below). |
| `dev/windows-writer-matrix.mjs` | The new suite is classified by the matrix. |

### Why the step-5b site needed its own code

Requirement: a success issued by the *initial* capability check must never be
accepted as a step-5b pass. Two independent mechanisms now enforce it:

* the step-2 code (`E_TEST_CAPABILITY_IDENTITY`) is one of the guards before
  the intended layer, so a step-2 refusal is reported **BLOCKED /
  INCONCLUSIVE**, never PASS (PMR-02 proves this with the fixture replaced
  *before* the transaction);
* the step-5b site raises its own code, so the code identity locates the layer
  by itself (PMR-04 proves the code exists at exactly one enforcement site in
  `lib/`).

PMR-01 proves the positive direction: the scenario reaches the mutation and
the refusal that follows is `E_TEST_CAPABILITY_REVERIFY` — the step-2 code is
not the one observed.

### Why the mutation test is a loader, not a patch

PMR-03 must prove that removing the step-5b re-verification makes the
detector **fail**. Patching `lib/production-writer.mjs` in the working tree
would dirty the tree and could leave the repository without the gate if a run
died midway. The loader rewrites the module in memory while it is loaded; the
file on disk is never modified, and the probe only reports a kill when it has
proof (a marker written by the loader) that the mutation was actually applied.

Observed probe output on this host:

```
MUTATION_KILLED: the detector refused the transaction (status=FAIL, actual=NO_ERROR)
```

`status=FAIL, actual=NO_ERROR` is the expected shape: with the gate removed the
transaction **completed**, so the detector had nothing to refuse — which is
precisely the failure the mutation test exists to make visible.

## Disposition of the other reviewed items

### NRC-04 — repaired, not skipped

The POSIX branch asserted that a **plain** `open()` refuses traversal, while
the test opened the path *without* `O_NOFOLLOW`. The expectation contradicted
the measurement and failed on every POSIX host.

The scenario is expressible on POSIX, so a platform skip would be a false
skip. It is now repaired and is a measurement on both platforms:

* a plain `open()` traverses the link everywhere (the gap is at open time);
* on Windows the report must claim no open-time protection
  (`atomicAtOpenTime: false`, `preCheckOnly: true`);
* on POSIX the report must claim the open-time protection it actually has
  (`atomicAtOpenTime: true`, `preCheckOnly: false`), and `O_NOFOLLOW` is
  measured refusing a link that is the **final** component.

### NRC-06 — repaired, not skipped

The scenario (a link swapped in after the pre-check) is cross-platform; only
the final expectation (`preCheckOnly === true`) was a Windows-only fact
asserted unconditionally. It is now asserted per platform, and the test
additionally proves that a pre-check running *after* the swap refuses the
reparse component — i.e. the first check was blind to it, which is the actual
claim.

### WIN-02 — explicit, measured platform skip

WIN-02 asserts that a **caller-supplied windows principal** cannot satisfy
verification. That comparison needs a windows principal on this host. On a
POSIX host the kind check fires first and the correct refusal is
`E_WRITER_PRINCIPAL_MISMATCH`; the windows branch is never reached, so the
scenario cannot be expressed.

The skip is therefore derived from a **measured** fact — the kind of the
current principal — and `WIN-02-PROOF` asserts both that the applicability
flag follows that measurement and that the refusal which does occur on a
non-Windows host is the correct one. The property is not left untested on
POSIX: "wrong principal rejected" and WIN-03 already cover the POSIX
equivalent.

**The TAP classifier was not touched.** No classification rule was changed to
turn a real failure into a skip; the skip is a TAP directive on the test's own
`ok` line, which the matrix parser already reads.

### B9-01b — left INCONCLUSIVE

B9-01b claims the writer's own root identity check (step 4b). The root is
replaced *before* the transaction starts, so the step-2 capability check
refuses first and step 4b is never reached. There is no evidence of reaching
the target layer, and none is obtainable in this scenario: replacing the root
between step 2 and step 4b needs a second process, and a replacement made
during the mutation is a different claim (that is B4-03's step 5b). The test
therefore stays INCONCLUSIVE — it is not promoted to a pass and not deleted.

## What was deliberately not done

* D-01 is still `DEFERRED`, the G-FENCE gate is still `NO_GO`, and
  `managedV2MutationAuthorized` is still `false`
  (`node test/validate-controlled-writer-lane.mjs` asserts all three).
* No production writer was enabled; no production gate was reordered,
  weakened, or disabled.
* The frozen candidate `690138ee` and PR #108 were not modified. The repair
  lives on a separate fix branch.
* No merge, no release, no tag, no publish, no npm publish.

## Follow-ups (not in this scope)

The Linux run of the candidate had a large number of **pre-existing** failures
unrelated to FINDING-001 (Stage 12/13/14 task-generator, context-pack,
React-Native and native-helper cases). They are unchanged by this repair and
are listed as follow-ups rather than silently absorbed here. The authoritative
comparison is the failure list of the candidate against the failure list of the
frozen fix SHA.
