#!/bin/bash
set -e

# Environment variables expected:
# ERROR_DATA - JSON string with error details
# GITHUB_TOKEN - GitHub personal access token
# ANTHROPIC_API_KEY - Anthropic API key for Claude Code
# GITHUB_REPO - Repository to fix (e.g., uthmanq/sharh)
# GITHUB_BASE_BRANCH - Base branch for PRs (e.g., main)

echo "=== Claude Code Auto-Fix Starting ==="

# Parse error data from JSON
ERROR_TYPE=$(echo "$ERROR_DATA" | jq -r '.errorType // "UnknownError"')
ERROR_MESSAGE=$(echo "$ERROR_DATA" | jq -r '.errorMessage // "Unknown error"')
FILE_NAME=$(echo "$ERROR_DATA" | jq -r '.fileName // "unknown"')
LINE_NUMBER=$(echo "$ERROR_DATA" | jq -r '.lineNumber // "unknown"')
FUNCTION_NAME=$(echo "$ERROR_DATA" | jq -r '.functionName // "unknown"')
STACK_TRACE=$(echo "$ERROR_DATA" | jq -r '.stackTrace // "[]"')
EVENT_ID=$(echo "$ERROR_DATA" | jq -r '.eventId // "unknown"')
ISSUE_URL=$(echo "$ERROR_DATA" | jq -r '.issueUrl // ""')

echo "Error Type: $ERROR_TYPE"
echo "Error Message: $ERROR_MESSAGE"
echo "File: $FILE_NAME:$LINE_NUMBER"
echo "Function: $FUNCTION_NAME"
echo "Event ID: $EVENT_ID"

# Configure git to use GitHub token for authentication
git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"

# Clone the repository
echo "=== Cloning repository ==="
git clone "https://github.com/${GITHUB_REPO}.git" /workspace/repo
cd /workspace/repo

# Checkout base branch
git checkout "${GITHUB_BASE_BRANCH:-main}"
git pull origin "${GITHUB_BASE_BRANCH:-main}"

echo "=== Running Claude Code ==="

# Let Claude Code handle everything: investigation, fix, commit, and PR creation
claude --print "
You are investigating and fixing a production error in this codebase.

**Error Details:**
- Type: ${ERROR_TYPE}
- Message: ${ERROR_MESSAGE}
- File: ${FILE_NAME}
- Line: ${LINE_NUMBER}
- Function: ${FUNCTION_NAME}
- Sentry Event ID: ${EVENT_ID}
${ISSUE_URL:+- Sentry Issue: ${ISSUE_URL}}

**Stack Trace:**
${STACK_TRACE}

**Your Task:**
1. Read the file mentioned in the error and understand the context
2. Investigate related files if needed to understand the root cause
3. Implement a fix that addresses the root cause
4. Create a new git branch named: auto-fix/sentry-${EVENT_ID}
5. Commit your changes with a descriptive commit message
6. Push the branch to origin
7. Create a GitHub Pull Request using the gh CLI with:
   - A clear title describing the fix
   - A body that explains:
     - What the error was
     - What caused it
     - How you fixed it
     - The Sentry Event ID: ${EVENT_ID}

Use the Bash tool for git commands and gh CLI for the PR.
Make sure to add 'Co-Authored-By: Claude <noreply@anthropic.com>' to your commit message.
" --allowedTools "Read,Edit,Glob,Grep,Bash" --dangerously-skip-permissions

echo "=== Auto-fix complete ==="
