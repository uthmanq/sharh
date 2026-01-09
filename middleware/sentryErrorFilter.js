/**
 * Sentry Error Filter Middleware
 *
 * Prevents test errors and development errors from being sent to production
 * Sentry instance. This middleware should be integrated with Sentry's
 * beforeSend hook.
 *
 * Related to Sentry Event ID: sqs-test-1767996173234
 */

/**
 * Filters out errors that shouldn't be reported to Sentry
 * @param {object} event - Sentry event object
 * @param {object} hint - Sentry hint object containing original error
 * @returns {object|null} - Modified event or null to drop the event
 */
function sentryErrorFilter(event, hint) {
  // Don't report errors in test environment
  if (process.env.NODE_ENV === 'test') {
    console.log('[Sentry Filter] Dropping error in test environment');
    return null;
  }

  // Filter out errors from test files
  const testFilePatterns = [
    /test\.js$/,
    /\.test\.js$/,
    /\.spec\.js$/,
    /_test\.js$/,
    /-test\.js$/,
    /test\/.*\.js$/,
    /__tests__\/.*\.js$/
  ];

  if (event.exception && event.exception.values) {
    for (const exception of event.exception.values) {
      if (exception.stacktrace && exception.stacktrace.frames) {
        for (const frame of exception.stacktrace.frames) {
          const filename = frame.filename || '';

          // Check if error originated from a test file
          if (testFilePatterns.some(pattern => pattern.test(filename))) {
            console.log(`[Sentry Filter] Dropping error from test file: ${filename}`);
            return null;
          }
        }
      }

      // Filter errors with "test" in the error type
      if (exception.type && /test/i.test(exception.type)) {
        console.log(`[Sentry Filter] Dropping test error type: ${exception.type}`);
        return null;
      }

      // Filter errors with test-related messages
      if (exception.value) {
        const testMessagePatterns = [
          /this is a test error/i,
          /test error from/i,
          /sqs.*test/i,
          /test.*script/i
        ];

        if (testMessagePatterns.some(pattern => pattern.test(exception.value))) {
          console.log(`[Sentry Filter] Dropping test error message: ${exception.value}`);
          return null;
        }
      }
    }
  }

  // Filter errors with test-related event IDs
  if (event.event_id && /test/i.test(event.event_id)) {
    console.log(`[Sentry Filter] Dropping test event ID: ${event.event_id}`);
    return null;
  }

  // Filter errors with test-related tags
  if (event.tags) {
    if (event.tags.environment === 'test' ||
        event.tags.environment === 'development' ||
        event.tags.isTest === true) {
      console.log('[Sentry Filter] Dropping error with test/dev tags');
      return null;
    }
  }

  // Allow all other errors
  return event;
}

/**
 * Configuration example for integrating with Sentry
 *
 * Usage:
 * const Sentry = require('@sentry/node');
 * const { sentryErrorFilter } = require('./middleware/sentryErrorFilter');
 *
 * Sentry.init({
 *   dsn: process.env.SENTRY_DSN,
 *   environment: process.env.NODE_ENV || 'production',
 *   beforeSend(event, hint) {
 *     return sentryErrorFilter(event, hint);
 *   },
 * });
 */

module.exports = {
  sentryErrorFilter
};
