# dotfiles

Personal dotfiles for macOS and Linux. One command to set up a new machine.

## Quick Start

```bash
git clone https://github.com/elhanarinc/dotfiles.git ~/Desktop/dotfiles
cd ~/Desktop/dotfiles
./install.sh
```

Then restart your terminal.

## What Gets Installed

### Shell
- **Oh-My-Zsh** with plugins:
  - `zsh-autosuggestions` — fish-like command suggestions
  - `zsh-syntax-highlighting` — real-time command coloring
  - `fzf-tab` — fuzzy tab completion for everything
  - `you-should-use` — reminds you when you have an alias
  - `kubectl` — kubernetes completion (`k` alias)
- **Starship** prompt — fast, cross-platform, context-aware

### Modern CLI tools (via Brewfile on macOS)
| Tool | Replaces | What it does |
|------|----------|--------------|
| `eza` | `ls` | File listing with icons and git status |
| `bat` | `cat` | Syntax-highlighted file viewing |
| `zoxide` | `cd` | Smart directory jumping by frecency |
| `ripgrep` (rg) | `grep` | Fast recursive search |
| `delta` | diff pager | Side-by-side git diffs |
| `fzf` | — | Fuzzy finder for files, history, processes |
| `starship` | shell prompt | Fast, informative, cross-platform prompt |

### Dev tools
- Go, Python (pyenv), Node (nvm), Ruby
- kubectl, helm, eksctl, terraform, awscli
- gh (GitHub CLI), jq, yq, tmux, vim, lazygit

### Editors & Terminals
- **Zed** — editor with vim mode, LSP for Go/Python/TS/Ruby, Claude AI
- **Ghostty** — terminal with shell integration, Tokyo Night theme, quick dropdown

### Fonts
- JetBrains Mono Nerd Font _(set this in your terminal preferences for icons)_
- Fira Code Nerd Font

## Machine-Specific Config (`~/.zshrc.local`)

Some config is machine-specific and should **never** be committed to git:

- API keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`, etc.)
- Work org settings (`GOPRIVATE`)
- Tool paths specific to this machine (Google Cloud SDK, Windsurf, OpenCode)

The install script creates `~/.zshrc.local` from `.zshrc.local.example`. Edit it:

```bash
vim ~/.zshrc.local
```

This file is sourced at the end of `.zshrc` and is gitignored.

## Zed Editor

Config lives in `.config/zed/` and is symlinked to `~/.config/zed/`. Three files:

| File | Purpose |
|------|---------|
| `settings.json` | Editor, vim mode, LSP, terminal, AI (Claude), per-language overrides |
| `keymap.json` | Space-leader vim bindings, pane navigation, lazygit |
| `tasks.json` | `lazygit` task (triggered via `<space>gg`) |

**First-time setup:**
1. Install the theme: `cmd+shift+p` → "zed: extensions" → search **Tokyo Night**
2. Set your Anthropic API key: agent panel → gear icon → paste key
   (or add `ANTHROPIC_API_KEY` to `~/.zshrc.local`)

**Key vim bindings:**

| Binding | Action |
|---------|--------|
| `jk` (insert) | Exit to normal mode |
| `ctrl-h/j/k/l` | Navigate panes |
| `space space` | File finder |
| `space f g` | Search in project |
| `space g g` | Open lazygit |
| `space g b` | Toggle git blame |
| `space c a` | Code actions |
| `space c r` | Rename symbol |
| `space t t` | Toggle terminal |
| `space a a` | Toggle AI agent |

## Ghostty Terminal

Config lives in `.config/ghostty/config` and is symlinked to `~/.config/ghostty/config`.

**Highlights:**
- Font: JetBrains Mono Nerd Font, size 14
- Theme: Tokyo Night (matches Zed)
- Left Option key → Meta/Alt (vim, readline word navigation)
- Right Option key → still types Unicode (ø, å, ™, etc.)
- Shell integration: semantic prompt marks, cursor changes at prompt
- tmux compatible: auto-disables conflicting integration inside tmux sessions

**Key bindings:**

| Binding | Action |
|---------|--------|
| `cmd+\`` (global) | Toggle quick terminal (Quake-style dropdown) |
| `cmd+t` | New tab |
| `cmd+d` | Split right |
| `cmd+shift+d` | Split down |
| `cmd+ctrl+h/j/k/l` | Navigate splits |
| `shift+↑/↓` | Jump between shell prompts |
| `cmd+shift+r` | Reload config |

Run `ghostty +list-themes` to browse all built-in themes.

## Font Setup

Starship and `eza` use icons that require a Nerd Font. After installation:

1. The JetBrains Mono Nerd Font is installed via Brewfile
2. Ghostty font is **pre-configured** via `.config/ghostty/config`
3. Other terminals: **Preferences → Font → JetBrains Mono Nerd Font**
   - iTerm2: `Preferences → Profiles → Text → Font`
   - Terminal.app: `Preferences → Profiles → Font`

## Tmux Key Bindings

Prefix is `Ctrl+a` (not the default `Ctrl+b`).

| Binding | Action |
|---------|--------|
| `prefix \|` | Split pane horizontally |
| `prefix -` | Split pane vertically |
| `prefix h/j/k/l` | Navigate panes (vim-style) |
| `prefix H/J/K/L` | Resize panes |
| `prefix r` | Reload tmux config |
| `prefix [` then `v` | Start vi copy selection |
| `prefix [` then `y` | Copy selection |

## Staying Up to Date

```bash
cd ~/Desktop/dotfiles
git pull
./install.sh   # safe to re-run — idempotent
```

## Repo Structure

```
dotfiles/
├── .zshrc                   # Main shell config
├── .zshrc.local.example     # Template for machine-specific config
├── .aliases                 # Shell aliases
├── .gitconfig               # Git configuration
├── .gitignore               # Repo gitignore
├── .vimrc                   # Vim configuration
├── .inputrc                 # Readline config
├── .tmux.conf               # Tmux configuration
├── .config/
│   ├── starship.toml        # Starship prompt config
│   ├── zed/
│   │   ├── settings.json    # Zed editor settings (vim, LSP, AI, terminal)
│   │   ├── keymap.json      # Zed keybindings (space leader, pane nav)
│   │   └── tasks.json       # Zed tasks (lazygit)
│   └── ghostty/
│       └── config           # Ghostty terminal config
├── .vim/
│   └── colors/              # Vim colorschemes
├── Brewfile                 # macOS package list
├── install.sh               # Idempotent bootstrap script
└── README.md                # This file
```
