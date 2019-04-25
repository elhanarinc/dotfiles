# Autocorrect typos in path names when using `cd`
shopt -s cdspell;

[[ -r "/usr/local/etc/profile.d/bash_completion.sh" ]] && . "/usr/local/etc/profile.d/bash_completion.sh"

parse_git_branch() {
    git branch 2> /dev/null | sed -e '/^[^*]/d' -e 's/* \(.*\)/ (\1)/'
}

export PS1="\[$(tput bold)\][\[$(tput sgr0)\]\[\033[38;5;39m\]\u\[$(tput sgr0)\]\[\033[38;5;15m\]@\[$(tput sgr0)\]\[\033[38;5;2m\]\h\[$(tput sgr0)\]\[\033[38;5;15m\]]:[\[$(tput sgr0)\]\[\033[38;5;11m\]\w\[$(tput sgr0)\]\[\033[38;5;15m\]]\[$(tput sgr0)\]\[\033[38;5;194m\]\$(parse_git_branch)\[$(tput sgr0)\] "
export CLICOLOR=1
export LSCOLORS=ExFxBxDxCxegedabagacad

export PATH="$HOME/.fastlane/bin:$PATH"
export PATH="$PATH:/Users/elhanarinc/development/flutter/bin"
export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools/"
export PATH="$PATH:$HOME/Library/Android/sdk/tools/bin"
export ANDROID_HOME="$HOME/Library/Android/sdk"

source ~/.aliases

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

