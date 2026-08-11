# genel

Fallback task board. `brief.mjs` reads `bin/state/tasks/<workspace>.md` first and falls back
to this file when the workspace has no board of its own. Only `- [ ]` lines are printed at
session start; `- [x]` lines are ignored.

Keep this board empty unless a task really is machine-wide: it is the fallback for *every*
directory, including ones outside the configured workspace roots.
