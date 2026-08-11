# Persistent Obsidian brain contract

`$HOME/Obsidian/brain` is the living persistent brain for the workspace roots declared in
`bin/state/config.json`.

- Use the SessionStart context. Before non-trivial project work, read the active leaf's `MEMORY.md`, then open only task-relevant notes linked from it.
- Write durable decisions, checkpoints, and preferences as atomic frontmatter notes in the correct leaf.
- Never hand-edit generated `MEMORY.md` files and never run a reindex by hand; the hooks own the index. Notes must include `name`, `index_title`, `index_hook`, `description`, and `metadata.type`.
- Update `bin/state/tasks/<workspace>.md` checkboxes when durable task state changes.
- Current repository and live evidence outrank stale brain notes. Update or archive notes that have drifted.
- User prompt capture is local and intentionally matches Claude's capture behavior.
- Outside the configured workspace roots, make no assumption about reading or writing the brain and stay silent.
- If the current repository has no leaf yet, attach it once:

```bash
/opt/homebrew/bin/node "$HOME/Obsidian/brain/bin/scripts/link-leaf.mjs" <workspace> "$PWD"
```
