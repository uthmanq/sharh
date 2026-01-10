require('dotenv').config();

module.exports = {
  aws: {
    region: process.env.AWS_REGION || 'us-east-2',
    sqsQueueUrl: process.env.SQS_ERROR_FIX_QUEUE_URL
  },

  worker: {
    maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS) || 2,
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS) || 5000,
    visibilityTimeout: 900, // 15 minutes
    jobTimeoutMs: parseInt(process.env.JOB_TIMEOUT_MS) || 600000 // 10 minutes
  },

  docker: {
    image: process.env.CLAUDE_CODE_DOCKER_IMAGE || 'sharh-claude-code:latest',
    networkMode: 'host'
  },

  github: {
    token: process.env.GITHUB_TOKEN,
    repo: process.env.GITHUB_REPO || 'uthmanq/sharh',
    baseBranch: process.env.GITHUB_BASE_BRANCH || 'main'
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY
  },

  sentry: {
    authToken: process.env.SENTRY_AUTH_TOKEN,
    organization: process.env.SENTRY_ORGANIZATION || 'launchify-wi',
    project: process.env.SENTRY_PROJECT || 'node-express',
    baseUrl: process.env.SENTRY_BASE_URL || 'https://sentry.io/api/0'
  }
};
