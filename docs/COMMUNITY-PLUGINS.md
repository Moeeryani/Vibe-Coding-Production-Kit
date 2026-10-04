# Community Plugins

Stage 10 adds a deliberately narrow, deterministic community profile/plugin model.

## Core rule

```text
files existing in a repository ≠ trusted plugin authority
```

A community plugin affects VCP only when the project explicitly selects it in:

```text
docs/plugins/PLUGINS.json
```

Selection, capability grants, and adoption of verification proposals remain HUMAN DECISION actions.

## V1 is declarative only

A Stage 10 plugin is a local text bundle. It is **not** a JavaScript module and has no executable hook.

Allowed bundle file types:

- `.json`
- `.md`

Rejected in v1:

- JavaScript/TypeScript/Python/shell entrypoints;
- binary payloads;
- symlinks anywhere inside the bundle;
- npm/registry/network discovery;
- remote URLs;
- arbitrary filesystem paths;
- hooks/scripts/entrypoints/core overrides;
- implicit trust from Git/GitHub ownership.

The manifest must be:

```text
<bundle>/plugin.json
```

## Project declaration

Example:

```json
{
  "schemaVersion": 1,
  "plugins": [
    {
      "id": "community.react-native-readiness",
      "version": "1.0.0",
      "path": "community-plugins/react-native-readiness",
      "sha256": "sha256:<64 lowercase hex>",
      "grants": [
        "guidance",
        "verification-proposals"
      ]
    }
  ]
}
```

Every selected plugin is pinned by exact:

- id;
- version;
- local repository-relative path;
- canonical SHA-256 digest;
- capability grants.

Plugin selection order is normalized by id so context/report order is deterministic.

No declaration means no community plugins are selected. VCP does not scan directories looking for plugins.

## Canonical digest

Compute a bundle pin with:

```bash
vcp plugins --dir . --digest community-plugins/react-native-readiness
```

or machine-readable:

```bash
vcp plugins --dir . --digest community-plugins/react-native-readiness --json
```

The digest covers **every file in the bundle**, sorted by portable path.

For cross-platform reproducibility:

- bundles are text-only in v1;
- CRLF/CR line endings normalize to LF before hashing;
- each path, normalized byte length, and content are framed into the hash;
- adding/removing/editing any bundle file changes the digest.

A digest change is not auto-trusted. Review the bundle and deliberately update the project declaration.

V1 also bounds local extension input before it reaches context rendering:

- at most 32 selected plugins per project declaration;
- at most 64 files per bundle;
- at most 2,000,000 raw bytes read across one bundle;
- at most 1,000,000 bytes after LF-normalized UTF-8 text decoding.

These are safety/resource limits, not signals of trust.

## Plugin manifest

Example:

```json
{
  "schemaVersion": 1,
  "kind": "vcp-community-profile",
  "id": "community.react-native-readiness",
  "version": "1.0.0",
  "name": "React Native readiness guidance",
  "description": "Additive project guidance.",
  "vcpCompatibility": {
    "minVersion": "0.9.3",
    "maxExclusiveVersion": "1.0.0"
  },
  "capabilities": [
    "guidance",
    "verification-proposals"
  ],
  "contributions": {
    "guidance": [
      {
        "path": "guidance/mobile-boundaries.md",
        "modes": ["plan", "implement", "review"],
        "title": "React Native mobile boundaries"
      }
    ],
    "verificationProposals": [
      {
        "key": "E2E_COMMAND",
        "command": "npm run test:e2e",
        "rationale": "Adopt only if the repository really owns this command."
      }
    ]
  }
}
```

Unknown manifest keys/capabilities are rejected. That intentionally rejects executable-style fields such as `entrypoint`, `hooks`, or `scripts`.

## Capability model

V1 knows two capabilities.

### `guidance`

Adds selected Markdown guidance to bounded context packs only for the manifest-declared modes:

- `plan`
- `implement`
- `review`
- `security`
- `release`

The content is additive. It does not override the core execution prompt, AGENTS.md, Source of Truth, readiness, security profiles, architecture fitness, or release policy.

### `verification-proposals`

Allows a plugin to surface concrete proposals for existing VCP verification slots such as:

```text
E2E_COMMAND=npm run test:e2e
```

The project must explicitly grant this capability.

Even after the grant, the proposal is rendered as:

```text
PROPOSAL — NOT APPLIED
```

VCP does **not**:

- write it into `AGENTS.md`;
- add it to a Task Pack verification plan;
- execute it;
- treat it as approval.

A human/project owner must deliberately adopt the command into project-owned verification state.

## Inspect selected plugins

```bash
vcp plugins --dir .
vcp plugins --dir . --json
```

Inspection is read-only and shows:

- selected id/version;
- local path;
- verified digest;
- explicit grants;
- guidance modes/files;
- verification proposals;
- trust boundary.

Invalid plugin state exits through the normal CLI error path instead of silently omitting the plugin.

## Doctor

`vcp doctor` uses the same loader.

- no declaration: PASS, no plugins selected;
- valid pinned selection: PASS;
- missing/tampered/incompatible/ungranted/symlinked/invalid bundle: FAIL.

Doctor never repairs trust or updates a digest.

## Lifecycle behavior

VCP does not create `docs/plugins/PLUGINS.json` during `init`.

Project declarations and local bundles are project-owned, outside the VCP managed-file manifest unless the project deliberately manages them through some separate mechanism. VCP update therefore does not invent selections or replace local community bundles.

## Security/trust boundaries

Plugin text is still untrusted external guidance from the perspective of engineering judgment. Selection says the project deliberately chose to include it; it does not make its claims true.

Core invariants always win:

- plugin guidance cannot authorize blocked work;
- plugin guidance cannot accept risk;
- plugin guidance cannot redefine Source of Truth authority;
- plugin command proposals cannot bypass readiness or verification eligibility;
- plugin files cannot overwrite core templates;
- a plugin cannot grant itself a capability;
- a plugin cannot weaken VCP behavior by adding unknown contribution namespaces.

## Reference fixture

See:

`examples/community-profile-react-native/`

It demonstrates the plugin model with React Native-oriented guidance.

It is **not** native mobile profile support and does not change `--stack auto`. Mobile profiles remain a separate roadmap item.
