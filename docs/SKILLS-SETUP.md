# VCP Skills setup

VCP ships eight Skills: small, reusable guides that teach a coding agent how
to run a VCP workflow. The **vcp router** is the default entry point — start
there; the seven specialized skills each cover one part of the workflow
(discover, plan, implement, review, security review, retrospective, release)
and always point back to the router for the rules that matter.

Skills do not hold project state. Your Task Packs (in `docs/tasks/`) hold
what is being changed, decided, and verified; a Skill only explains how to do
that work. Installing a Skill never creates or changes a Task Pack.

## Discover what is available

```sh
vcp skills list
vcp skills show vcp-plan
```

`list` shows every packaged Skill, what it is for, and which `vcp` commands
it routes to. `show` gives the detail for one Skill: its purpose, the
workflow phase it serves, and the canonical prompts and references it uses.

## See which agent environments are present

```sh
vcp skills detect
```

VCP looks for the agents you actually use — in this project and in your home
directory — and reports which ones it can install Skills for:

| Agent | Project location | Personal location |
|---|---|---|
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| OpenAI Codex | `.agents/skills/` | `~/.agents/skills/` |
| GitHub Copilot | `.github/skills/` | — (no verified personal location) |
| Any Agent Skills-compatible agent | `.agents/skills/` | `~/.agents/skills/` |

Cursor is detected when a `.cursor/` directory is present, but it has no
VCP-verified dedicated Skills directory: use the generic `.agents/skills/`
target, which any Agent Skills-compatible agent reads. Codex and the generic
target share `.agents/skills/` — installing for either lands in the same
place. VCP does not claim to support agents or directories beyond this
table.

## Install (preview first, apply explicitly)

Installation is a two-step, explicit act. First preview:

```sh
vcp skills install --target claude
```

The plan lists every Skill and what would happen to it: `INSTALL`,
`UP_TO_DATE`, `UPDATE`, or `CONFLICT`. Nothing is written. To install:

```sh
vcp skills install --target claude --apply
```

Useful variations:

```sh
# Install into your personal directory instead of this project:
vcp skills install --target claude --scope user --apply

# Install only the router and the planning skill (the router is always included):
vcp skills install --target claude --only vcp-plan --apply

# See what is already installed, and whether it is current:
vcp skills status
```

Installed Skills are exact copies of the packaged files, plus one manifest
(`.vcp-skills.json`) recording the package version and file digests. `status`
uses it to report `UP_TO_DATE`, `STALE` (a newer package version exists),
or `NEEDS_ATTENTION` (files were edited after install). Re-running install
updates a clean stale install; it never silently overwrites your edits.

## Your files are never overwritten

If a Skill directory already exists and VCP did not install it — or you edited
it after install — installation stops with a `CONFLICT` instead of
overwriting. To proceed, back the existing directory up first with
`--replace`:

```sh
vcp skills install --target claude --apply --replace
```

The existing directory is moved to a timestamped `*.vcp-backup-*` folder
next to it. Nothing is deleted, ever.

## After installing

- In Claude Code, Skills load automatically when a request matches their
  description, or by name with `/vcp`, `/vcp-plan`, and so on.
- In other agents, Skills load from the same `SKILL.md` files under the
  shared Agent Skills standard; ask the agent to use the `vcp` skill first.
- If a Skill seems out of date after upgrading VCP, run
  `vcp skills status` and re-install: the manifest tells you exactly what
  changed.
- Removing Skills is manual: delete the installed directories. VCP has no
  uninstall command, so it can never remove files you own by mistake.
