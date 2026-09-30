# Reference prompt snapshots

This directory makes the reference SaaS invitation fixture self-contained for VCP workflow dogfood.

These files are **fixture-local snapshots of the canonical prompts in the repository root `prompts/` directory**. They are intentionally local because `vcp context --dir <project>` resolves phase prompts from the selected project root; it does not fall back to parent/global framework content.

Do not customize these copies independently. `test/reference-context.test.mjs` enforces byte-for-byte parity with the canonical root prompt files and proves that a clean copy of this fixture can build plan, implementation, and review context packs without manual prompt copying.

This snapshot does **not** make the reference example a separately lifecycle-managed VCP installation and does not add a `.vcp/manifest.json`. Lifecycle installation semantics remain separate from this conformance fixture.
