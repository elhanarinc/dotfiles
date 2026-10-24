#!/usr/bin/env bash
# Settings only *declare* plugins; nothing downloads them. Register the declared
# marketplaces and install every enabled plugin that is missing. Failures warn,
# they never abort (a fresh machine may be offline or not logged in yet).
set -uo pipefail
DOTFILES_DIR="${DOTFILES_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
source "$DOTFILES_DIR/scripts/lib.sh"
OFFICIAL_MARKETPLACE=claude-plugins-official
OFFICIAL_SOURCE=anthropics/claude-plugins-official
settings="$HOME/.claude/settings.json"

command_exists claude || { info "claude not installed; skipping plugin bootstrap"; exit 0; }
command_exists node || { warn "node not found; skipping plugin bootstrap"; exit 0; }
[[ -f "$settings" ]] || { info "no $settings; skipping plugin bootstrap"; exit 0; }
if [[ "${DRY_RUN:-0}" == 1 ]]; then info "would register declared Claude marketplaces and install enabled plugins"; exit 0; fi

# Declared state, as tab-separated lines: "M<TAB>name<TAB>source" or "P<TAB>name@marketplace".
plan="$(node - "$settings" "$OFFICIAL_MARKETPLACE" "$OFFICIAL_SOURCE" <<'JS'
const fs = require('node:fs');
const [file, official, officialSource] = process.argv.slice(2);
const s = JSON.parse(fs.readFileSync(file, 'utf8'));
const markets = new Map();
for (const [name, v] of Object.entries(s.extraKnownMarketplaces ?? {})) {
  const src = v?.source ?? {};
  const spec = src.repo ?? src.url ?? src.path;
  if (spec) markets.set(name, spec);
}
const plugins = Object.entries(s.enabledPlugins ?? {}).filter(([, on]) => on === true).map(([id]) => id);
for (const id of plugins) {
  const m = id.split('@')[1];
  if (m === official && !markets.has(official)) markets.set(official, officialSource);
}
for (const [n, spec] of markets) console.log(`M\t${n}\t${spec}`);
for (const id of plugins) console.log(`P\t${id}`);
JS
)" || { warn "could not read plugin declarations from $settings"; exit 0; }

names_of() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{for(const x of JSON.parse(d))console.log(x.name??x.id)}catch{}})'; }
registered="$(claude plugin marketplace list --json 2>/dev/null | names_of)"
installed="$(claude plugin list --json 2>/dev/null | names_of)"

while IFS=$'\t' read -r kind a b; do
  case "$kind" in
    M)
      if grep -Fxq -- "$a" <<<"$registered"; then info "marketplace present: $a"
      else run claude plugin marketplace add "$b" || warn "could not add marketplace $a ($b)"; fi ;;
    P)
      if grep -Fxq -- "$a" <<<"$installed"; then info "plugin present: $a"
      else run claude plugin install "$a" --scope user || warn "could not install plugin $a"; fi ;;
  esac
done <<<"$plan"
exit 0
