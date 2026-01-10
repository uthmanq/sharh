/**
 * Configuration for the automated error-fix pipeline
 *
 * This config controls which errors trigger the auto-fix workflow.
 * Adjust these settings based on your needs.
 */

module.exports = {
  // Master switch - enable/disable the entire pipeline
  enabled: process.env.ERROR_FIX_ENABLED === 'true',

  // Which environments should trigger auto-fix
  // Default: only production errors
  environments: (process.env.ERROR_FIX_ENVIRONMENTS || 'production').split(',').map(e => e.trim()),

  // Error types to ignore (won't trigger auto-fix)
  // Common ones to ignore: URIError (usually malformed URLs from bots)
  ignoreTypes: (process.env.ERROR_FIX_IGNORE_TYPES || 'URIError').split(',').map(e => e.trim()).filter(Boolean),

  // Regex patterns for error messages to ignore
  // These are typically transient network errors that don't need code fixes
  ignorePatterns: [
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /ECONNREFUSED/i,
    /socket hang up/i,
    /ENOTFOUND/i,
    /EAI_AGAIN/i,
    /Client network socket disconnected/i
  ],

  // Minimum number of occurrences before triggering fix
  // Set to 1 to fix immediately, higher values for more conservative approach
  minOccurrences: parseInt(process.env.ERROR_FIX_MIN_OCCURRENCES) || 1,

  // Maximum fixes per hour (rate limiting)
  // Prevents runaway costs if many errors occur
  maxFixesPerHour: parseInt(process.env.ERROR_FIX_MAX_PER_HOUR) || 10,

  // GitHub repository to create PRs in
  githubRepo: process.env.ERROR_FIX_GITHUB_REPO || 'uthmanq/sharh',

  // Base branch for PRs
  baseBranch: process.env.ERROR_FIX_BASE_BRANCH || 'main',

  // Worker configuration
  worker: {
    // Maximum concurrent fix jobs
    maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS) || 2,

    // Timeout for each fix attempt (in milliseconds)
    jobTimeout: parseInt(process.env.ERROR_FIX_JOB_TIMEOUT) || 600000, // 10 minutes

    // Docker image for Claude Code
    dockerImage: process.env.ERROR_FIX_DOCKER_IMAGE || 'sharh-claude-code:latest'
  }
};
