# Architecture Fitness Functions

Stage 8 turns **explicit architecture decisions** into deterministic repository checks.

VCP does not infer an architecture, create a dependency graph service, or decide module ownership. A project opts in by creating:

`docs/architecture/FITNESS.json`

The configuration is project-owned Source of Truth for executable boundaries.

## What Stage 8 checks

The initial analyzer is intentionally bounded to static JavaScript-family local imports.

It can enforce:

- every analyzed source file belongs to exactly one declared module;
- cross-module dependency direction follows `mayImport`;
- cross-module imports enter through declared `publicEntries`;
- module dependency cycles are rejected;
- unresolved or outside-source-root local imports fail;
- non-literal dynamic `import(...)` / `require(...)` fail instead of being treated as proven safe;
- declared architecture/ADR contract markers remain present;
- governing ADRs remain `Accepted`.

Non-relative import specifiers are counted as external-to-this-analyzer and are not scored as module-direction dependencies in Stage 8. This includes Node builtins, package imports, and project path aliases that do not begin with `.`; projects that rely on aliases need a future explicit resolver extension rather than assuming Stage 8 resolved them.

## Configuration

Example:

```json
{
  "schemaVersion": 1,
  "analyzer": "javascript-static-imports",
  "sourceRoots": ["src"],
  "extensions": [".mjs"],
  "modules": [
    {
      "name": "domain",
      "owner": "membership-domain",
      "roots": ["src/domain"],
      "mayImport": [],
      "publicEntries": ["src/domain/index.mjs"]
    },
    {
      "name": "application",
      "owner": "membership-application",
      "roots": ["src/application"],
      "mayImport": ["domain"],
      "publicEntries": ["src/application/invitation-service.mjs"]
    }
  ],
  "rules": {
    "forbidCycles": true,
    "requireOwnership": true,
    "enforcePublicEntries": true
  },
  "governingContracts": [
    {
      "path": "docs/architecture/ARCHITECTURE.md",
      "kind": "architecture",
      "marker": "ARCHITECTURE-CONTRACT: invitation-layering-v1"
    },
    {
      "path": "docs/architecture/adr/ADR-001-invite-token-storage.md",
      "kind": "adr",
      "marker": "ADR-CONTRACT: invite-token-hash-v1"
    }
  ]
}
```

### Module ownership

`sourceRoots` declare the only source trees Stage 8 claims to analyze.

Every configured source file extension found under those roots must belong to exactly one module when `requireOwnership` is enabled. Module roots may not overlap.

The `owner` value is a durable human/project label. VCP records it; it does not assign ownership automatically.

### Dependency direction

Same-module imports are always allowed.

Cross-module imports must name the target module in the source module's `mayImport` list.

This is an allow-list, so absence is meaningful.

### Public contracts

When `enforcePublicEntries` is enabled, every cross-module local import must target one of the destination module's exact `publicEntries`.

A deep internal file may still import siblings inside its own module. The rule protects **cross-module** access, encouraging deep modules with narrow external interfaces.

### Cycles

`forbidCycles` checks the realized module dependency graph produced by resolved local imports. Stage 8 does not persist a generic graph or require dependency metadata in Task Packs.

### Architecture and ADR regression markers

`governingContracts` deliberately couples executable rules to durable architecture decisions.

Each configured marker must appear as an exact trimmed line exactly once in its document.

For `kind: "adr"`, the document must also contain exactly one canonical status declaration whose value is `Accepted`. Stage 8 accepts both VCP ADR styles:

```markdown
## Status
Accepted
```

or:

```markdown
- Status: Accepted
```

Markers are contract identifiers, not semantic prose grading. Editing explanatory prose does not break the check as long as the named contract is still intentionally valid. If the architecture decision changes, update the document marker/config together through normal review rather than silently weakening the executable boundary.

## CLI

Run against the default config:

```bash
vcp fitness --dir .
```

Use a different project-relative config:

```bash
vcp fitness --dir . --config docs/architecture/FITNESS.json --json
```

A missing config is an error. VCP does not infer architecture automatically.

Exit code is non-zero when any declared boundary is violated.

## Analyzer boundary

Stage 8 supports these source extensions:

- `.js`
- `.mjs`
- `.cjs`
- `.jsx`
- `.ts`
- `.mts`
- `.cts`
- `.tsx`

The analyzer recognizes:

- static `import ... from "..."`;
- side-effect `import "..."`;
- static `export ... from "..."`;
- literal dynamic `import("...")`;
- literal `require("...")`.

Local imports must resolve to an explicit configured extension. Non-literal dynamic local dependency behavior is not silently accepted. Module specifiers containing JavaScript backslash escapes are rejected rather than decoded or classified as external, so an escaped runtime-relative path cannot bypass the declared module boundary. The `externalImports` summary counts only specifiers proven non-relative (for example packages or Node builtins); rejected/unsupported specifiers do not inflate that count.

This is intentionally not a universal AST/dependency engine. The conservative lexer ignores comments/string/template raw text and observes template expressions, but it does not claim complete JavaScript lexical parsing. If quote/template state becomes ambiguous or remains unterminated—for example because dependency-looking syntax interacts with an unsupported regular-expression form—the run fails closed with an `unsupported-lexer-state` violation instead of silently producing a green architecture result. If a project needs a richer language/framework analyzer, path-alias resolver, or full JavaScript parser, that is a future explicit extension rather than hidden Stage 8 inference.

## What a pass proves

A pass proves only that at least one configured source file was analyzed and that the files/import forms covered by the explicit configuration satisfy those declared rules at that revision.

It does **not** prove:

- the architecture is optimal;
- runtime/service topology is correct;
- external packages are safe;
- every language construct is analyzed;
- architectural decisions outside the configured contracts are satisfied.
