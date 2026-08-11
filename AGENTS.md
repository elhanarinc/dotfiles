# Repository Guidelines

## Scope

This is a public workstation-bootstrap repository. Track reusable configuration and empty templates only. Never add credentials, authentication/session data, personal Git identity, employer-specific settings, project history, machine trust state, hard-coded user paths, or existing Obsidian notes.

## Development safety

- Do not run `./install.sh` without `--dry-run` on an already configured workstation while developing this repository.
- Test mutations with a temporary `HOME` and stubbed commands.
- Preserve existing local files, AI settings, and living-brain content; use backup-before-link behavior.
- Never add package cleanup/removal to the default flow.
- Keep macOS arm64 as the primary target and Linux behavior best-effort.

## Validation

Run before committing:

```bash
bash tests/run.sh
find scripts tests -type f -name '*.sh' -print0 | xargs -0 -n1 bash -n
scripts/audit-public.sh
git diff --check
```

The only allowed real-machine installer validation during repository development is `./install.sh --dry-run`. Inventory, doctor, and `brew bundle check` are read-only.

## Commits

Use Conventional Commits: `<type>(<scope>): <lowercase description>`. Common types are `feat`, `fix`, `refactor`, `test`, `docs`, and `chore`. Do not push until tests, public audit, final diff, and tracked-file review are clean.

## Living brain

AI configuration may wire generic hooks to `~/Obsidian/brain`, but this repository contains only the empty template and portable scripts. Workspace names and roots live in the installed brain's local `bin/state/config.json`, never in this repository.

The `*.mjs` files under `brain-template/bin/scripts/` are the *real* scripts, kept byte-identical to the installed brain so code cannot drift. After changing them on a machine, run `scripts/sync-brain-template.sh` and re-run `tests/brain_test.sh` and `scripts/audit-public.sh`.

Two deliberate exceptions to that parity, both code-only:

- `verify.mjs` is not vendored at all — it asserts against one machine's workspace names, symlink count and fixtures.
- `brain-template/bin/docs/README.md` is a separate, portable setup manual, not a copy of the installed brain's own README. The sync script does not touch it; update it by hand when behaviour changes.
