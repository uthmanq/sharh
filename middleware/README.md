# Middleware Documentation

## asyncHandler

The `asyncHandler` middleware wrapper ensures that errors thrown in async route handlers are properly caught and forwarded to Express's error handling middleware.

### Problem

Express doesn't automatically catch errors thrown in async functions. When an async route handler throws an error or a promise is rejected without proper error handling, it can result in:
- Unhandled promise rejections
- "Unknown error" messages with no stack traces
- Application crashes or hanging requests

### Solution

Wrap all async route handlers with `asyncHandler`:

```javascript
const asyncHandler = require('../middleware/asyncHandler');

router.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new Error('User not found'); // This will be caught properly
  }
  res.json(user);
}));
```

### Benefits

1. **Automatic Error Forwarding**: All errors are forwarded to Express error middleware
2. **Clean Code**: No need for try-catch blocks in every handler
3. **Better Debugging**: Stack traces are preserved and logged
4. **Prevents Crashes**: Unhandled rejections are eliminated

### When to Use

Use `asyncHandler` for:
- All async route handlers (async/await)
- Handlers that return promises
- Any handler that performs asynchronous operations (database queries, API calls, file operations)

### Migration Guide

**Before:**
```javascript
router.post('/user', async (req, res) => {
  try {
    const user = await User.create(req.body);
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});
```

**After:**
```javascript
router.post('/user', asyncHandler(async (req, res) => {
  const user = await User.create(req.body);
  res.json(user);
}));
```

The error handling middleware in `app.js` will automatically catch and log all errors.
