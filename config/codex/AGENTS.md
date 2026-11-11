# Persistent Obsidian brain contract

`$HOME/Obsidian/brain` is the living persistent brain for the workspace roots declared in
`bin/state/config.json`.

- Use the SessionStart context. Before non-trivial project work, read the active leaf's `MEMORY.md`, then open only task-relevant notes linked from it.
- Write durable decisions, checkpoints, and preferences as atomic frontmatter notes in the correct leaf.
- Never hand-edit generated `MEMORY.md` files and never run a reindex by hand; the hooks own the index. Notes must include `name`, `index_title`, `index_hook`, `description`, and `metadata.type`.
- Update `bin/state/tasks/<workspace>.md` checkboxes when durable task state changes.
- Current repository and live evidence outrank stale brain notes. Update or archive notes that have drifted.
- SessionEnd capture is local and intentionally matches Claude's: prompts, files written, and state-changing shell commands (allowlisted, secrets redacted). It records mechanically and cannot decide what is durable — writing the note is still your job.
- Outside the configured workspace roots (scope dışı), make no assumption about reading or writing the brain and stay silent.
- If the current repository has no leaf yet, attach it once:

```bash
/opt/homebrew/bin/node "$HOME/Obsidian/brain/bin/scripts/link-leaf.mjs" <workspace> "$PWD"
```

## Brain recall (search before answering)

The SessionStart context only lists one line per note for the current leaf. Before answering about past decisions, preferences, constraints or project status, and before proposing any idea, tool, channel or spend, search the brain (the proposal may already be dead with data):

```bash
node "$HOME/Obsidian/brain/bin/scripts/search.mjs" "<terms>"   # --ws <ws> | --all | --type feedback | --limit N | --body
```

Query in both Turkish and English. `feedback`/`user` notes are standing rules; `[archive]` hits are retired. Skip it for plain code reading, debugging and mechanical edits.

Dönüşü Türkçe yaz; kod, yol ve durum anahtar kelimeleri aynen kalır.
