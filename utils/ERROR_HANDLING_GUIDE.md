# Error Handling Guide

This guide explains the new centralized error handling system and how to use it in routes.

## Problem Statement

The application was experiencing "UnknownError" issues with no stack traces because:
1. Errors were caught but only generic messages were sent to clients
2. Error details were lost (no stack traces preserved)
3. Inconsistent error handling across different routes
4. No structured error logging
5. Unhandled promise rejections were not caught

## Solution

A centralized error handling system has been implemented with:
- Structured error logging with full context
- Consistent error response format
- Automatic error categorization
- Stack trace preservation (in non-production)
- Global handlers for unhandled rejections and uncaught exceptions

## Usage

### 1. Using asyncHandler (Recommended)

Wrap async route handlers with `asyncHandler` to automatically catch errors:

```javascript
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.get('/example', asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  res.json({ success: true, user });
}));
```

### 2. Throwing Custom Errors

Use the `AppError` class for operational errors:

```javascript
const { AppError } = require('../utils/errorHandler');

// Throw with custom status code
throw new AppError('Invalid credentials', 401);

// Default to 500
throw new AppError('Database connection failed');

// Mark as non-operational (programming error)
throw new AppError('Critical system failure', 500, false);
```

### 3. Replacing Existing Error Handlers

**Before (Bad):**
```javascript
router.post('/signup', async (req, res) => {
  try {
    const user = await User.create(req.body);
    res.json({ user });
  } catch (err) {
    console.log(err);
    res.status(500).send('Internal Server Error');
  }
});
```

**After (Good):**
```javascript
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.post('/signup', asyncHandler(async (req, res) => {
  const existingUser = await User.findOne({ email: req.body.email });

  if (existingUser) {
    throw new AppError('User already exists', 400);
  }

  const user = await User.create(req.body);
  res.json({ success: true, user });
}));
```

### 4. Error Response Format

Clients will receive consistent JSON responses:

```json
{
  "success": false,
  "error": {
    "message": "User not found",
    "statusCode": 404,
    "timestamp": "2024-01-09T10:30:00.000Z",
    "type": "AppError"
  }
}
```

In development, stack traces are included:

```json
{
  "success": false,
  "error": {
    "message": "User not found",
    "statusCode": 404,
    "timestamp": "2024-01-09T10:30:00.000Z",
    "type": "AppError",
    "stack": "Error: User not found\n    at ..."
  }
}
```

### 5. Logging Format

Server logs include full context:

```json
{
  "timestamp": "2024-01-09T10:30:00.000Z",
  "message": "User not found",
  "stack": "Error: User not found\n    at ...",
  "name": "AppError",
  "statusCode": 404,
  "request": {
    "method": "GET",
    "url": "/user/123",
    "path": "/user/:id",
    "params": { "id": "123" },
    "query": {},
    "body": {},
    "headers": {
      "user-agent": "Mozilla/5.0...",
      "content-type": "application/json"
    },
    "userId": "abc123"
  }
}
```

### 6. Automatic Error Type Handling

The middleware automatically handles common error types:

- **ValidationError**: Returns 400 with validation details
- **CastError**: Returns 400 for invalid MongoDB IDs
- **MongoError (11000)**: Returns 409 for duplicate keys
- **JsonWebTokenError**: Returns 401 for invalid tokens
- **TokenExpiredError**: Returns 401 for expired tokens

### 7. Migration Checklist

To update existing routes:

1. Import the error handler utilities:
   ```javascript
   const { asyncHandler, AppError } = require('../utils/errorHandler');
   ```

2. Wrap async route handlers:
   ```javascript
   router.get('/path', asyncHandler(async (req, res) => {
     // Your code here
   }));
   ```

3. Replace try-catch blocks with `throw new AppError()`:
   ```javascript
   // Instead of:
   if (!user) {
     return res.status(404).send('User not found');
   }

   // Use:
   if (!user) {
     throw new AppError('User not found', 404);
   }
   ```

4. Remove generic error handlers:
   ```javascript
   // Remove these:
   } catch (err) {
     console.log(err);
     res.status(500).send('Internal Server Error');
   }
   ```

## Benefits

1. **Better Debugging**: Full error context with stack traces
2. **Consistent API**: Same error format across all endpoints
3. **Security**: Sensitive data is automatically sanitized
4. **Monitoring**: Structured logs for easy parsing and alerting
5. **Production Ready**: Stack traces hidden in production
6. **Error Tracking**: Easy to integrate with services like Sentry

## Next Steps

1. Gradually migrate existing routes to use the new error handling
2. Consider adding Sentry or similar error tracking service
3. Set up log aggregation (e.g., CloudWatch, ELK, Datadog)
4. Add custom error codes for better client-side handling
5. Implement retry logic for transient failures
