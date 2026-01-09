/**
 * Async Handler Wrapper
 * Wraps async route handlers to ensure errors are properly caught
 * and forwarded to Express error handling middleware
 *
 * This prevents unhandled promise rejections that can result in
 * "Unknown error" messages with no stack traces.
 *
 * Usage:
 * router.get('/path', asyncHandler(async (req, res) => {
 *   // Your async code here
 * }));
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = asyncHandler;
