ARG VARIANT=latest
FROM oven/bun:${VARIANT}

ARG TZ
ENV TZ="$TZ"

ARG CLAUDE_CODE_VERSION=latest

# Install basic development tools and firewall dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    less \
    git \
    procps \
    sudo \
    fzf \
    zsh \
    man-db \
    unzip \
    gnupg2 \
    gh \
    iptables \
    ipset \
    iproute2 \
    dnsutils \
    aggregate \
    jq \
    nano \
    vim \
    tmux \
    ca-certificates \
    wget \
    curl \
    locales \
    && apt-get clean && rm -rf /var/lib/apt/lists/* \
    && echo "en_US.UTF-8 UTF-8" > /etc/locale.gen \
    && locale-gen

# Persist history
RUN mkdir -p /commandhistory \
    && touch /commandhistory/.bash_history \
    && chown -R bun:bun /commandhistory \
    && echo "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" >> /home/bun/.bashrc

# Setup Firewall Script
COPY init-firewall.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/init-firewall.sh \
    && echo "bun ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/bun-firewall \
    && chmod 0440 /etc/sudoers.d/bun-firewall

# Setup Directories
RUN mkdir -p /home/bun/.claude /home/bun/.codex /home/bun/.gemini /home/bun/.npm-global \
    && chown -R bun:bun /home/bun/.claude /home/bun/.codex /home/bun/.gemini /home/bun/.npm-global

# Set `DEVCONTAINER` environment variable to help with orientation
ENV DEVCONTAINER=true

# Set the default shell to zsh rather than sh
ENV SHELL=/bin/zsh

# Set the default editor and visual
ENV EDITOR=nano
ENV VISUAL=nano

ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) && \
    wget "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
    dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
    rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# Install current Node.js for CLI tools
RUN curl -fsSL https://deb.nodesource.com/setup_current.x | bash - \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Update npm to the latest version
RUN npm install -g npm@latest

# Ensure global bin directory exists and is writable by bun
RUN mkdir -p /home/bun/.bun/bin && chown -R bun:bun /home/bun/.bun

# Prepare npm dirs for bun user
RUN mkdir -p /home/bun/.npm /home/bun/.npm-global \
    && chown -R bun:bun /home/bun/.npm /home/bun/.npm-global

USER bun

# Ensure global bin is in PATH
ENV NPM_CONFIG_PREFIX=/home/bun/.npm-global
ENV PATH="/home/bun/.local/bin:/home/bun/.bun/bin:/home/bun/.npm-global/bin:${PATH}"

# Install Oh My Zsh, Powerlevel10k, and plugins manually for better control
RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended \
    && git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k \
    && git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions \
    && git clone https://github.com/zsh-users/zsh-syntax-highlighting.git ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting

# Configure .zshrc
RUN echo 'export PATH=$HOME/.local/bin:$HOME/.bun/bin:$HOME/.npm-global/bin:$PATH' >> ~/.zshrc \
    && echo 'ZSH_THEME="powerlevel10k/powerlevel10k"' >> ~/.zshrc \
    && echo 'plugins=(git zsh-autosuggestions zsh-syntax-highlighting)' >> ~/.zshrc \
    && echo 'source $HOME/.oh-my-zsh/oh-my-zsh.sh' >> ~/.zshrc \
    && echo "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" >> ~/.zshrc

# Configure tmux defaults
RUN cat <<'EOF' > ~/.tmux.conf
set -g default-terminal "tmux-256color"
set -ag terminal-overrides ",xterm-256color:RGB"
set -g default-shell /bin/zsh
set -g default-command /bin/zsh
set -g mouse on
set -g history-limit 100000
set -g base-index 1
setw -g pane-base-index 1
set -g renumber-windows on
set -g status-interval 5
set -g status-left-length 30
set -g status-right-length 80
bind r source-file ~/.tmux.conf \; display-message "tmux config reloaded"
unbind '"'
unbind %
bind | split-window -h
bind - split-window -v
EOF

# Install Gemini CLI and Codex CLI
RUN set -euo pipefail; \
    cache_dir="$(mktemp -d /tmp/npm-cache.XXXXXX)"; \
    tmp_dir="$(mktemp -d /tmp/npm-tmp.XXXXXX)"; \
    TMPDIR="${tmp_dir}" npm --cache "${cache_dir}" install -g --no-audit --no-fund @google/gemini-cli @google/gemini-cli-core @openai/codex; \
    rm -rf "${cache_dir}" "${tmp_dir}"

# Install Claude Code (Native Install)
RUN curl -fsSL https://claude.ai/install.sh | bash
