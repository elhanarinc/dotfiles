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

AI configuration may wire generic hooks to `~/Obsidian/brain`, but this repository contains only the empty template and portable scripts. Registration paths live in the installed brain's local `config.json`, never in this repository.
