#!/bin/bash
set -e

# Test script for the error-fix Docker workflow
# This simulates what the worker does when it receives an error from SQS

echo "=== Error Fix Workflow Test ==="

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "ERROR: .env file not found. Copy .env.example to .env and fill in values."
    exit 1
fi

# Validate required env vars
if [ -z "$GITHUB_TOKEN" ]; then
    echo "ERROR: GITHUB_TOKEN not set"
    exit 1
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "ERROR: ANTHROPIC_API_KEY not set"
    exit 1
fi

echo "Environment variables loaded"

# Step 1: Build the Docker image
echo ""
echo "=== Step 1: Building Docker image ==="
cd claude-image
docker build -t sharh-claude-code:latest .
cd ..
echo "Docker image built successfully"

# Step 2: Create test error data
# This simulates a real Sentry error - pointing to the debug-sentry route
echo ""
echo "=== Step 2: Preparing test error data ==="

TEST_ERROR_DATA=$(cat <<'EOF'
{
  "eventId": "test-event-123",
  "issueId": "test-issue-456",
  "errorType": "Error",
  "errorMessage": "Test Sentry error!",
  "stackTrace": "[{\"filename\": \"app.js\", \"lineno\": 114, \"function\": \"app.get\"}]",
  "fileName": "app.js",
  "lineNumber": 114,
  "functionName": "app.get",
  "culprit": "app.get(/debug-sentry)",
  "environment": "development",
  "timestamp": "2024-01-01T00:00:00Z",
  "projectName": "sharh",
  "issueUrl": null,
  "tags": {},
  "request": {
    "url": "/debug-sentry",
    "method": "GET"
  }
}
EOF
)

echo "Test error data prepared"
echo "Error: Test Sentry error! in app.js:114"

# Step 3: Run the Docker container
echo ""
echo "=== Step 3: Running Docker container ==="
echo "This will:"
echo "  - Clone the repository"
echo "  - Run Claude Code to analyze the 'error'"
echo "  - Attempt to create a PR (on a test branch)"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted"
    exit 0
fi

# Run the container
docker run --rm \
    -e "ERROR_DATA=$TEST_ERROR_DATA" \
    -e "GITHUB_TOKEN=$GITHUB_TOKEN" \
    -e "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" \
    -e "GITHUB_REPO=${GITHUB_REPO:-uthmanq/sharh}" \
    -e "GITHUB_BASE_BRANCH=${GITHUB_BASE_BRANCH:-main}" \
    sharh-claude-code:latest

echo ""
echo "=== Test Complete ==="
echo "Check GitHub for a new PR on the auto-fix/sentry-test-event-123 branch"
