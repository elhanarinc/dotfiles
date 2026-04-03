# =============================================================
# PATH — set before everything else
# =============================================================
export PATH="$HOME/bin:$HOME/.local/bin:/usr/local/bin:$PATH"

# =============================================================
# Oh-My-Zsh
# =============================================================
export ZSH="$HOME/.oh-my-zsh"

# Disable oh-my-zsh theme — Starship handles the prompt
ZSH_THEME=""

ZSH_DOTENV_PROMPT=false
HIST_STAMPS="yyyy-mm-dd"

# Homebrew completions — must be before oh-my-zsh source
if command -v brew &>/dev/null; then
  FPATH="$(brew --prefix)/share/zsh-completions:$(brew --prefix)/share/zsh/site-functions:$FPATH"
fi

# Plugins — order matters:
# fzf-tab must come before zsh-syntax-highlighting
plugins=(
  git
  zsh-autosuggestions
  fzf-tab
  zsh-syntax-highlighting
  you-should-use
  kubectl
)

# macOS-specific plugins
if [[ "$(uname)" == "Darwin" ]]; then
  plugins+=(macos)
fi

source "$ZSH/oh-my-zsh.sh"

# =============================================================
# History
# =============================================================
HISTSIZE=50000
SAVEHIST=50000
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_FIND_NO_DUPS
setopt HIST_REDUCE_BLANKS
setopt SHARE_HISTORY

# =============================================================
# Environment
# =============================================================
export LANG=en_US.UTF-8
export EDITOR=vim
export VISUAL=vim

# =============================================================
# Go
# =============================================================
if command -v go &>/dev/null || command -v brew &>/dev/null; then
  if command -v brew &>/dev/null && brew --prefix go &>/dev/null 2>&1; then
    export GOROOT="$(brew --prefix go)/libexec"
  fi
  export GOPATH="$HOME/go"
  export GO111MODULE=on
  export PATH="$PATH${GOROOT:+:$GOROOT/bin}:$GOPATH/bin"
fi

# =============================================================
# Pyenv
# =============================================================
export PYENV_ROOT="$HOME/.pyenv"
if [[ -d "$PYENV_ROOT/bin" ]]; then
  export PATH="$PYENV_ROOT/bin:$PATH"
fi
if command -v pyenv &>/dev/null; then
  eval "$(pyenv init - zsh)"
fi

# =============================================================
# NVM (Node Version Manager) — lazy loaded for faster shell startup
# NVM initializes on first use of: nvm, node, npm, npx, yarn, pnpm
# =============================================================
export NVM_DIR="$HOME/.nvm"
_nvm_load() {
  unset -f nvm node npm npx yarn pnpm
  [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
  [ -s "$NVM_DIR/bash_completion" ] && source "$NVM_DIR/bash_completion"
}
nvm()  { _nvm_load; nvm "$@"; }
node() { _nvm_load; node "$@"; }
npm()  { _nvm_load; npm "$@"; }
npx()  { _nvm_load; npx "$@"; }
yarn() { _nvm_load; yarn "$@"; }
pnpm() { _nvm_load; pnpm "$@"; }

# =============================================================
# Ruby (Homebrew)
# =============================================================
if [[ "$(uname)" == "Darwin" ]] && command -v brew &>/dev/null; then
  export PATH="/opt/homebrew/opt/ruby/bin:$PATH"
fi

# =============================================================
# Java (Zulu JDK 17)
# =============================================================
if [[ -d "/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home" ]]; then
  export JAVA_HOME="/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home"
fi

# =============================================================
# Android SDK
# =============================================================
if [[ -d "$HOME/Library/Android/sdk" ]]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools"
fi

# =============================================================
# kubectl alias (completion handled by oh-my-zsh kubectl plugin)
# =============================================================
alias k=kubectl

# =============================================================
# fzf
# =============================================================
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

if command -v brew &>/dev/null; then
  _fzf_prefix="$(brew --prefix fzf 2>/dev/null || echo '')"
  [ -f "$_fzf_prefix/shell/completion.zsh" ] && source "$_fzf_prefix/shell/completion.zsh"
  [ -f "$_fzf_prefix/shell/key-bindings.zsh" ] && source "$_fzf_prefix/shell/key-bindings.zsh"
  unset _fzf_prefix
fi

# fzf default options
export FZF_DEFAULT_OPTS='--height 40% --layout=reverse --border --inline-info'
if command -v rg &>/dev/null; then
  export FZF_DEFAULT_COMMAND='rg --files --hidden --follow --glob "!.git"'
fi

# =============================================================
# zoxide (smart cd)
# =============================================================
if command -v zoxide &>/dev/null; then
  eval "$(zoxide init zsh --cmd cd)"
fi

# =============================================================
# Aliases
# =============================================================
[ -f ~/.aliases ] && source ~/.aliases

# =============================================================
# Machine-specific config (not tracked in git)
# Put API keys, GOPRIVATE, gcloud paths, etc. in here
# =============================================================
[ -f ~/.zshrc.local ] && source ~/.zshrc.local

# =============================================================
# Starship prompt — must be last
# =============================================================
if command -v starship &>/dev/null; then
  eval "$(starship init zsh)"
fi
