FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    jq \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user (Claude Code won't run as root with --dangerously-skip-permissions)
RUN useradd -m -s /bin/bash claude && \
    mkdir -p /workspace && \
    chown -R claude:claude /workspace

# Copy fix script
COPY fix-error.sh /usr/local/bin/fix-error
RUN chmod +x /usr/local/bin/fix-error

# Switch to non-root user
USER claude
WORKDIR /workspace

# Set git config (required for commits)
RUN git config --global user.email "claude-code-bot@sharhapp.com" \
    && git config --global user.name "Claude Code Bot"

# Entrypoint
ENTRYPOINT ["/usr/local/bin/fix-error"]
