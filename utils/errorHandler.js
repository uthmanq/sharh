/**
 * Centralized Error Handling Utility
 * Provides consistent error formatting, logging, and response handling
 */

class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Format error for logging with full context
 */
const formatErrorForLogging = (error, req = null) => {
  const errorLog = {
    timestamp: new Date().toISOString(),
    message: error.message || 'Unknown error',
    stack: error.stack,
    name: error.name || 'Error',
    statusCode: error.statusCode || 500,
  };

  if (req) {
    errorLog.request = {
      method: req.method,
      url: req.url,
      path: req.path,
      params: req.params,
      query: req.query,
      // Don't log sensitive data like passwords
      body: sanitizeRequestBody(req.body),
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
      },
      userId: req.user?.id || req.user?._id,
    };
  }

  return errorLog;
};

/**
 * Sanitize request body to remove sensitive information
 */
const sanitizeRequestBody = (body) => {
  if (!body || typeof body !== 'object') return body;

  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard'];
  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
};

/**
 * Format error response for client
 * Never expose sensitive error details in production
 */
const formatErrorResponse = (error, includeStack = false) => {
  const isProduction = process.env.ENVIRONMENT === 'production';

  const response = {
    success: false,
    error: {
      message: error.message || 'An unexpected error occurred',
      statusCode: error.statusCode || 500,
      timestamp: error.timestamp || new Date().toISOString(),
    }
  };

  // Only include stack trace in non-production environments
  if (!isProduction && includeStack && error.stack) {
    response.error.stack = error.stack;
  }

  // Include error name for better categorization
  if (error.name) {
    response.error.type = error.name;
  }

  return response;
};

/**
 * Async error handler wrapper for routes
 * Automatically catches errors in async route handlers
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Express error handling middleware
 * Should be used as the last middleware in app.js
 */
const errorMiddleware = (err, req, res, next) => {
  // Default to 500 if no status code is set
  const statusCode = err.statusCode || 500;

  // Log the full error with context
  const errorLog = formatErrorForLogging(err, req);

  // Use appropriate logging level based on error type
  if (statusCode >= 500) {
    console.error('SERVER ERROR:', JSON.stringify(errorLog, null, 2));
  } else if (statusCode >= 400) {
    console.warn('CLIENT ERROR:', JSON.stringify(errorLog, null, 2));
  }

  // Special handling for specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        statusCode: 400,
        details: err.errors,
      }
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid ID format',
        statusCode: 400,
      }
    });
  }

  if (err.name === 'MongoError' && err.code === 11000) {
    return res.status(409).json({
      success: false,
      error: {
        message: 'Duplicate field value',
        statusCode: 409,
      }
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Invalid token',
        statusCode: 401,
      }
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Token expired',
        statusCode: 401,
      }
    });
  }

  // Send formatted error response
  const includeStack = process.env.ENVIRONMENT !== 'production';
  const response = formatErrorResponse(err, includeStack);

  res.status(statusCode).json(response);
};

/**
 * Handle unhandled promise rejections
 */
const handleUnhandledRejection = (reason, promise) => {
  console.error('UNHANDLED PROMISE REJECTION:', {
    timestamp: new Date().toISOString(),
    reason: reason,
    stack: reason?.stack,
    promise: promise,
  });

  // In production, you might want to restart the process
  // process.exit(1);
};

/**
 * Handle uncaught exceptions
 */
const handleUncaughtException = (error) => {
  console.error('UNCAUGHT EXCEPTION:', {
    timestamp: new Date().toISOString(),
    message: error.message,
    stack: error.stack,
    name: error.name,
  });

  // Exit process as the application is in an undefined state
  process.exit(1);
};

module.exports = {
  AppError,
  formatErrorForLogging,
  formatErrorResponse,
  asyncHandler,
  errorMiddleware,
  handleUnhandledRejection,
  handleUncaughtException,
};
