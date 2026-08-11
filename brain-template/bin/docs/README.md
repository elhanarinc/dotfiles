# Living Brain

A local, plain-Markdown memory shared by Claude Code and Codex. One machine, no server, no
Docker, no MCP. This template ships the **software only** — no notes, no workspace names, no
machine paths. Those live in `bin/state/config.json`, which is created on first install and
never tracked in this repository.

Open the installed brain (`~/Obsidian/brain`) as an Obsidian vault (`Open folder as vault`) if
you want to browse it. Obsidian is for humans; the agents read the filesystem directly and do
not need it running.

## Layout

```text
brain/
  <workspace>/     one folder per project ("leaf"), each with its own generated MEMORY.md
  archive/         notes dropped out of active context
  bin/
    scripts/       all executables (hooks + maintenance)
    state/
      config.json  THIS MACHINE's workspaces — the only machine-specific file
      inbox/       raw end-of-session captures, per workspace
      tasks/       one open-task board per workspace, plus genel.md as fallback
    docs/          this file
```

Every leaf folder is symlinked from the harness project directory:
`~/.claude/projects/<project>/memory` → `~/Obsidian/brain/<workspace>/<leaf>`. Harness behaviour
is unchanged — each project still loads only **its own** `MEMORY.md`. The symlink only makes the
otherwise-hidden folders visible in one vault.

**The symlinks are load-bearing.** Delete one and that project loses its memory.

## First run on a new machine

```sh
N=/opt/homebrew/bin/node   # nvm's `node` is a shell function and does not exist inside hooks

# 1. Declare this machine's workspaces (names are yours; roots are cwd prefixes).
cp ~/Obsidian/brain/bin/state/config.example.json ~/Obsidian/brain/bin/state/config.json
$EDITOR ~/Obsidian/brain/bin/state/config.json

# 2. Attach a project. Run once per repository you want remembered.
$N ~/Obsidian/brain/bin/scripts/link-leaf.mjs personal ~/Desktop/personal-projects/some-repo
$N ~/Obsidian/brain/bin/scripts/link-leaf.mjs personal ~/Desktop/personal-projects --as _kok

# 3. Confirm the wiring.
$N ~/Obsidian/brain/bin/scripts/audit.mjs
```

Until `config.json` has a workspace whose `root` is a prefix of your cwd, **every hook stays
silent by design** — it never writes into the brain from an unknown directory.

`link-leaf.mjs` moves an existing harness `memory/` folder into the vault before linking, so
notes written before the brain was installed are preserved, not overwritten.

## Installed hooks

Claude (`~/.claude/settings.json`):

| Event | Script | What it does |
|---|---|---|
| `SessionStart` | `bin/scripts/brief.mjs` | Prints the workspace's open tasks and the last unprocessed inbox capture. |
| `SessionEnd` | `bin/scripts/capture.mjs` | Writes the session's prompts, touched files and ops commands to `bin/state/inbox/<workspace>/`. |
| `PostToolUse` (`Write\|Edit`) | `bin/scripts/reindex-hook.mjs` | Regenerates the leaf `MEMORY.md` whenever a note is written. |

Codex (`~/.codex/hooks.json`, contract in `~/.codex/AGENTS.md`) uses the same vault through
`codex-brief.mjs`, `codex-capture.mjs` and `codex-reindex-hook.mjs`. Codex's built-in
`features.memories` should stay off — two memories that disagree is worse than one.

Hooks are global and fire in every directory on the machine. Each one maps `cwd` against
`config.json`; in unknown folders (temp dirs, other people's repos) they do nothing at all.

`SessionStart` stdout goes straight into the context window (**10,000 character limit**);
`brief.mjs` truncates at 8,000 and deliberately does not repeat `MEMORY.md`, which the harness
already loads.

## What an inbox capture records

`topic` (first prompt) · `touched` (files written through Write/Edit/apply_patch) · `ops`
(state-changing shell commands) · `notes` (brain notes written). All four are surfaced by the
next session's brief.

`ops` exists because file paths alone under-report the work. A DNS cutover, an IAM change, a
deploy or a PR runs entirely through the shell and touches no file — such a session used to be
recorded with an empty `touched` and read as "nothing happened".

The rule is `opsFromCommand` in `lib.mjs`, and it is an **allowlist**: `aws` mutating verbs,
the state-changing subcommands of `kubectl`/`terraform`/`helm`/`eksctl`, `docker push`,
`git push|tag|merge`, `gh pr create|merge`, `gh release create`, and `npm|yarn|pnpm publish`.
Read commands (`describe-*`, `list-*`, `get-*`, `plan`, `status`, `ls`/`grep`/`dig`/`curl`)
are excluded explicitly, and so is `git commit`: it recurs several times in any coding
session, crowding out the deploy that mattered, and in those sessions `touched` already tells
the story. What leaves the machine is `push`.

An allowlist rather than "everything that isn't a read": a single session issues dozens of
read commands, and they would fill the field's 200-character budget with noise while pushing
the one mutation that mattered outside the cut.

Command text is redacted (`redactSecrets`) before it reaches the note, splitting is
quote-aware, and heredoc bodies are dropped — writing a fixture or a script that *mentions*
`git push` does not count as having run it.

## Writing a note

Put these in the frontmatter — **that is the whole procedure.** Never hand-edit `MEMORY.md`
(it is generated; hand-added lines vanish on the next sync) and never run a reindex by hand
(the hooks do it).

```yaml
---
name: short-slug
index_title: Title as it should appear in MEMORY.md
index_hook: "One-line summary as it should appear in MEMORY.md"
description: Longer description
metadata:
  type: user | feedback | project | reference
---
```

Notes with `status: archived` are excluded from the index (`archive.mjs` stamps that for you).
A generated index can only link inside its own folder; to point elsewhere, write a
`type: reference` pointer note.

## Maintenance

```sh
$N ~/Obsidian/brain/bin/scripts/reindex.mjs --check   # stale index? (exit 1 = yes)
$N ~/Obsidian/brain/bin/scripts/audit.mjs             # resolve every leaf to its real repo path
$N ~/Obsidian/brain/bin/scripts/prune.mjs --apply     # archive leaves whose repo is gone
$N ~/Obsidian/brain/bin/scripts/archive.mjs personal/_kok/old_note.md
$N ~/Obsidian/brain/bin/scripts/fixlinks.mjs          # repair mechanical [[wikilink]] mismatches
$N ~/Obsidian/brain/bin/scripts/unmigrate.mjs         # full undo plan (--apply to execute)
```

The end-to-end verifier (`verify.mjs`) is **not** part of this template: it asserts against one
specific machine's workspaces, symlink count and fixtures. It belongs in the installed brain,
not in a portable bootstrap.

## Known limits

- `capture.mjs` cannot decide what is durable — it only records mechanically. "Forgetting to
  write it down" becomes visible debt in the inbox instead of silent loss.
- `ops` is an allowlist, so a mutation run through a tool nobody listed is invisible. Adding a
  tool is one line in `SUBCOMMAND_RULES`; the alternative (capture everything) was measured and
  is worse.
- Heredoc detection is line-based: a `<<` appearing inside an already-quoted argument would
  start swallowing lines. Rare enough to accept, not airtight.
- The index does not shrink on its own. `archive.mjs` exists, but you choose what to drop.
- Codex clamps its `SessionEnd` hook to a few seconds at runtime; the capture script finishes
  well under that, but a very large rollout file is the thing to watch.
- Memory is per project, task boards are per workspace. In a sub-project you see the
  workspace's open tasks but not the parent folder's notes — that is the harness's own
  behaviour, made visible rather than changed.
