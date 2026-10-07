# Autocorrect typos in path names when using `cd`
shopt -s cdspell;

if [[ -x /opt/homebrew/bin/brew ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [[ -x /usr/local/bin/brew ]]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi
[[ -r "${HOMEBREW_PREFIX:-/usr/local}/etc/profile.d/bash_completion.sh" ]] && . "${HOMEBREW_PREFIX:-/usr/local}/etc/profile.d/bash_completion.sh"

parse_git_branch() {
    git branch 2> /dev/null | sed -e '/^[^*]/d' -e 's/* \(.*\)/ (\1)/'
}

export PS1="\[$(tput bold)\][\[$(tput sgr0)\]\[\033[38;5;39m\]\u\[$(tput sgr0)\]\[\033[38;5;15m\]@\[$(tput sgr0)\]\[\033[38;5;2m\]\h\[$(tput sgr0)\]\[\033[38;5;15m\]]:[\[$(tput sgr0)\]\[\033[38;5;11m\]\w\[$(tput sgr0)\]\[\033[38;5;15m\]]\[$(tput sgr0)\]\[\033[38;5;194m\]\$(parse_git_branch)\[$(tput sgr0)\] "
export CLICOLOR=1
export LSCOLORS=ExFxBxDxCxegedabagacad

source ~/.aliases

