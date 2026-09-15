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
$N ~/Obsidian/brain/bin/scripts/link-leaf.mjs <workspace> ~/code/some-repo
$N ~/Obsidian/brain/bin/scripts/link-leaf.mjs <workspace> ~/code --as _kok

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
| `SessionStart` | `bin/scripts/brief.mjs` | Prints the workspace's open tasks and the last unprocessed inbox capture; sweeps the workspace for dead links and missing backlinks, and links any unlinked **empty** `memory/` folder into the vault. |
| `SessionEnd` | `bin/scripts/capture.mjs` | Writes the session's prompts, touched files and ops commands to `bin/state/inbox/<workspace>/`. |
| `PostToolUse` (`Write\|Edit\|Bash`) | `bin/scripts/reindex-hook.mjs` | Regenerates the leaf `MEMORY.md` whenever a note is written, repairs the note's dead wikilinks and **writes** the missing peer backlinks (below). |
| `Stop` | `bin/scripts/nudge.mjs` | Nudges once when a substantial session is about to end without a single note (below). |

Codex (`~/.codex/hooks.json`, contract in `~/.codex/AGENTS.md`) uses the same vault through
`codex-brief.mjs`, `codex-capture.mjs` and `codex-reindex-hook.mjs`. Codex's built-in
`features.memories` should stay off — two memories that disagree is worse than one.

Hooks are global and fire in every directory on the machine. Each one maps `cwd` against
`config.json`; in unknown folders (temp dirs, other people's repos) they do nothing at all.

`SessionStart` stdout goes straight into the context window (**10,000 character limit**);
`brief.mjs` truncates at 8,000 and deliberately does not repeat `MEMORY.md`, which the harness
already loads.

## The pull layer: `search.mjs`

Everything above is **push**: the brain speaks at session start and writes at session end, and
does nothing in between. That leaves two holes, and both were repeatedly patched by adding yet
another push channel — which is why they kept coming back in a new shape.

**Missing context.** The harness loads only the current directory's `MEMORY.md`, and that is
**one line per note**. Notes in every other leaf are invisible, and even in the loaded leaf the
note bodies are never opened. Finding the right note depended on that single line happening to
mention what was asked.

```sh
node bin/scripts/search.mjs "<terms>" [--ws <name>] [--all] [--type feedback] [--limit N] [--body]
```

- **No index file, on purpose.** A second source of truth that needs syncing is exactly the
  failure class this removes. A full scan of a few thousand notes takes milliseconds and the
  result always matches the disk.
- **Scope:** by default every leaf of the current workspace plus that workspace's archive.
  Other workspaces only via `--ws` — so an employer's notes cannot leak into a personal session.
- **Ranking:** title ×8, `index_hook`/`description` ×4, body ×1; `feedback`/`user` ×1.5 (missing
  a standing *rule* is the most expensive kind of miss); `archive/` ×0.5 and tagged `[archive]`.
- **Turkish folding** is applied to the query and the text through the same function
  (`İ/I/ı → i`, plus `ş/ğ/ü/ö/ç`), so casing never splits a word.
- Make it mandatory with an always-loaded skill: search before answering anything about past
  decisions, **before proposing** any tool/channel/idea/spend, and whenever a project other
  than the current directory comes up.

## The write nudge: `nudge.mjs`

The decision to write a note used to rest entirely on the agent remembering, unprompted:
`capture.mjs` deliberately refuses to judge what is durable, and the inbox capture is written
*after* the session ends — far too late to act as a prompt.

- **Threshold:** ≥3 user prompts AND (≥1 mutating ops command OR ≥1 file write) AND no note written.
- **Channel:** `exit 2` + stderr. A `Stop` hook's `exit 0` stdout goes only to the debug log —
  neither the user nor the model sees it. So the nudge costs one extra turn, which is why the
  threshold is high.
- **Once:** a `bin/state/nudged/<session_id>.txt` marker (written *before* exiting 2) plus the
  `stop_hook_active` guard. Markers self-clean after 30 days.
- **Timing limit:** `Stop` fires at the end of every assistant *turn*, not at session end, so
  the nudge lands at the first turn boundary past the threshold — sometimes mid-task. The
  message says so, and says no second nudge is coming.

## Self-healing links

Indexing is automatic, but connecting notes to each other used to be checked by nobody: a session
would write a new note, add the forward links, and skip the backlink on the sibling note. The gap
stayed invisible until a human noticed it — the same shape of failure the index hook was built to
end. A reporting layer was added first: `reindex-hook.mjs` named the links that were not
reciprocated, in the same turn they were written.

**Reporting turned out to be the wrong layer.** A later audit of a live vault — while that
reporting layer was working exactly as designed — found 27 dead wikilinks and 37 notes owed a
backlink. Seeing the message and acting on it depended on the model behaving in that same turn,
and it did not. Both jobs are mechanical, so both are now done, not announced:

- **dead wikilinks.** Obsidian resolves `[[target]]` by **filename**, not by the note's
  frontmatter `name:` slug, and the two diverge in a large share of notes (files `snake_case`,
  slugs `kebab-case`) — while the harness memory instruction tells every session to link by slug.
  A link written *correctly per the instruction* is therefore born dead. The hook rewrites it to
  the filename form when exactly **one** candidate matches.
- **missing backlinks.** The hook appends the source to the target's trailing `İlgili:`
  ("related") line, creating the line if absent. Frontmatter is never touched and the write is
  idempotent.

What stays manual is everything that needs judgment. The rule is deliberately narrow
(`lib.mjs` → `oneWayLinks`, `repairLinksInText`):

- **project↔project pairs only.** `reference` / `feedback` / `user` notes are hubs by design —
  dozens of project notes point at one reference note, and expecting it to point back at all of
  them is nonsense.
- **resolvable targets only.** `[[note-not-written-yet]]` is a to-do marker, not an error.
- **single candidate only.** If two files could match, which one was meant is semantic — left
  alone. Same for a link whose target does not exist at all.
- comparison ignores filename ↔ slug differences (`project_x_y.md` matches `[[project-x-y]]`).

Counting every link as symmetric flagged 179 notes in a real vault of ~300; the narrow rule cut
that to 94 and emits 0–2 lines per write. Three layers, mirroring how indexing works:

1. `PostToolUse` (both the Claude and the Codex hook) repairs at write time,
2. `SessionStart` (`brief.mjs`) sweeps the whole workspace — notes edited by hand in Obsidian
   fire no hook at all, and this is the only thing that catches those. It prints one line if it
   did something and stays silent otherwise, because `SessionStart` stdout is context budget,
3. `bin/scripts/backlink.mjs --apply` and `fixlinks.mjs --apply` remain the bulk arms, covering
   the entire vault (archive and docs included) in one pass. Every file a backlink run writes is
   listed in `bin/state/backlink-*.log`, which is the undo record.

Tests: `node bin/tests/selfheal.test.mjs` (24 cases pinning both sides of the boundary — what it
fixes and what it must not touch), plus `onewaylinks.test.mjs` and `backlink.test.mjs`.

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
$N ~/Obsidian/brain/bin/scripts/search.mjs "<terms>"  # DAILY USE: read before answering
$N ~/Obsidian/brain/bin/scripts/reindex.mjs --check   # stale index? (exit 1 = yes)
$N ~/Obsidian/brain/bin/scripts/audit.mjs             # resolve every leaf to its real repo path
$N ~/Obsidian/brain/bin/scripts/prune.mjs --apply     # archive leaves whose repo is gone
$N ~/Obsidian/brain/bin/scripts/archive.mjs personal/_kok/old_note.md
$N ~/Obsidian/brain/bin/scripts/fixlinks.mjs          # repair mechanical [[wikilink]] mismatches
$N ~/Obsidian/brain/bin/scripts/backlink.mjs          # report one-way project↔project links
$N ~/Obsidian/brain/bin/tests/selfheal.test.mjs       # boundary tests for the self-healing layer
$N ~/Obsidian/brain/bin/scripts/backlink.mjs --apply  # write the missing backlinks (idempotent)
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
