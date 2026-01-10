const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const errorFixConfig = require('../config/errorFixConfig');

// Initialize SQS client
const sqsClient = new SQSClient({
  region: process.env.AWS_REGION
});

/**
 * Verify Sentry webhook signature
 * Returns: { valid: boolean, error?: string }
 */
function verifySentrySignature(payload, signature, secret) {
  // In production, require the secret
  if (!secret) {
    if (process.env.ENVIRONMENT === 'production') {
      return { valid: false, error: 'SENTRY_WEBHOOK_SECRET not configured' };
    }
    console.warn('[Sentry Webhook] WARNING: No secret configured, skipping signature verification');
    return { valid: true };
  }

  if (!signature) {
    return { valid: false, error: 'Missing sentry-hook-signature header' };
  }

  try {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload, 'utf8');
    const expectedSignature = hmac.digest('hex');

    // Debug logging
    console.log('[Sentry Webhook] Received signature:', signature);
    console.log('[Sentry Webhook] Expected signature:', expectedSignature);

    // Handle potential length mismatch before timingSafeEqual
    if (signature.length !== expectedSignature.length) {
      return { valid: false, error: `Invalid signature (length mismatch: got ${signature.length}, expected ${expectedSignature.length})` };
    }

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    return { valid: isValid, error: isValid ? null : 'Invalid signature' };
  } catch (error) {
    return { valid: false, error: `Signature verification failed: ${error.message}` };
  }
}

/**
 * Extract file path and line number from Sentry stack trace
 */
function extractErrorLocation(exception) {
  if (!exception?.values?.[0]?.stacktrace?.frames) {
    return { fileName: null, lineNumber: null };
  }

  const frames = exception.values[0].stacktrace.frames;
  // Frames are in reverse order, last frame is most relevant
  const relevantFrame = frames[frames.length - 1];

  return {
    fileName: relevantFrame?.filename || relevantFrame?.abs_path || null,
    lineNumber: relevantFrame?.lineno || null,
    functionName: relevantFrame?.function || null
  };
}

/**
 * Check if error should be processed based on config
 */
function shouldProcessError(errorData) {
  const config = errorFixConfig;

  // Check if pipeline is enabled
  if (!config.enabled) {
    console.log('[Sentry Webhook] Pipeline disabled, skipping');
    return false;
  }

  // Check environment
  if (!config.environments.includes(errorData.environment)) {
    console.log(`[Sentry Webhook] Environment ${errorData.environment} not in allowed list, skipping`);
    return false;
  }

  // Check ignored error types
  if (config.ignoreTypes.includes(errorData.errorType)) {
    console.log(`[Sentry Webhook] Error type ${errorData.errorType} is ignored, skipping`);
    return false;
  }

  // Check ignored patterns
  for (const pattern of config.ignorePatterns) {
    if (pattern.test(errorData.errorMessage)) {
      console.log(`[Sentry Webhook] Error message matches ignore pattern, skipping`);
      return false;
    }
  }

  return true;
}

/**
 * POST /sentry/webhook
 * Receives Sentry issue alerts and queues them for auto-fix
 */
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['sentry-hook-signature'];

    // req.body is a raw Buffer when using express.raw()
    const rawBody = req.body.toString('utf8');

    // Verify webhook signature using raw body
    const verification = verifySentrySignature(rawBody, signature, process.env.SENTRY_WEBHOOK_SECRET);
    if (!verification.valid) {
      console.error('[Sentry Webhook] Verification failed:', verification.error);
      return res.status(401).json({ error: verification.error });
    }

    // Parse JSON after verification
    const event = JSON.parse(rawBody);

    // Debug: log the event structure
    console.log('[Sentry Webhook] Full payload:', JSON.stringify(event, null, 2));

    // Handle different Sentry webhook types
    if (event.action !== 'created' && event.action !== 'triggered') {
      // Only process new issues or triggered alerts
      return res.status(200).json({ message: 'Event type ignored' });
    }

    // Extract error data from Sentry event
    // The webhook sends data in event.data.error (Internal Integration format)
    const errorEvent = event.data?.error || event.data?.event || event.data?.issue || {};

    const exception = errorEvent.exception;
    const exceptionValue = exception?.values?.[0] || {};
    const stackFrames = exceptionValue.stacktrace?.frames || [];

    // Find the most relevant frame (last in-app frame, or last frame)
    let inAppFrame = null;
    if (stackFrames.length > 0) {
      inAppFrame = [...stackFrames].reverse().find(f => f.in_app) || stackFrames[stackFrames.length - 1];
    }

    // Extract error type and message with better fallbacks
    const errorType = exceptionValue.type || errorEvent.type || 'UnknownError';
    const errorMessage = exceptionValue.value || errorEvent.message || errorEvent.title || 'Unknown error';

    // Log warning if we have insufficient error data
    if (!inAppFrame && stackFrames.length === 0) {
      console.warn('[Sentry Webhook] Warning: No stack trace available for error');
      console.warn('[Sentry Webhook] Error type:', errorType);
      console.warn('[Sentry Webhook] Error message:', errorMessage);
      console.warn('[Sentry Webhook] Event ID:', errorEvent.event_id);
    }

    const errorData = {
      eventId: errorEvent.event_id || `sentry-${Date.now()}`,
      issueId: errorEvent.issue_id,
      errorType: errorType,
      errorMessage: errorMessage,
      stackTrace: JSON.stringify(stackFrames),
      fileName: inAppFrame?.filename || inAppFrame?.abs_path || null,
      lineNumber: inAppFrame?.lineno || null,
      colNumber: inAppFrame?.colno || null,
      functionName: inAppFrame?.function || null,
      codeContext: inAppFrame?.context_line || null,
      culprit: errorEvent.culprit || errorEvent.transaction,
      environment: errorEvent.environment || 'unknown',
      timestamp: errorEvent.datetime || new Date().toISOString(),
      projectName: event.data?.project?.name || 'sharh',
      issueUrl: errorEvent.web_url || null,
      tags: errorEvent.tags || [],
      breadcrumbs: errorEvent.breadcrumbs?.values || [],
      request: errorEvent.request || {}
    };

    console.log('[Sentry Webhook] Built errorData:', JSON.stringify(errorData, null, 2));

    // Skip errors without sufficient location information
    // These can't be automatically fixed as we don't know which file to modify
    if (!errorData.fileName && !errorData.issueId) {
      console.log('[Sentry Webhook] Skipping error with no file location and no issue ID for enrichment');
      return res.status(200).json({
        message: 'Error skipped: insufficient location information',
        reason: 'No stack trace or file location available. This error cannot be automatically fixed.'
      });
    }

    // Check if we should process this error
    if (!shouldProcessError(errorData)) {
      return res.status(200).json({ message: 'Error filtered out by config' });
    }

    // Check rate limiting
    // TODO: Implement rate limiting with Redis or in-memory counter

    // Send to SQS queue
    const sqsParams = {
      QueueUrl: process.env.SQS_ERROR_FIX_QUEUE_URL,
      MessageBody: JSON.stringify(errorData),
      MessageAttributes: {
        JobType: {
          DataType: 'String',
          StringValue: 'error-fix'
        },
        Environment: {
          DataType: 'String',
          StringValue: errorData.environment
        },
        ErrorType: {
          DataType: 'String',
          StringValue: errorData.errorType
        }
      }
    };

    const command = new SendMessageCommand(sqsParams);
    const sqsResponse = await sqsClient.send(command);

    console.log(`[Sentry Webhook] Queued error-fix job: ${errorData.eventId}, SQS MessageId: ${sqsResponse.MessageId}`);

    res.status(200).json({
      message: 'Error queued for auto-fix',
      eventId: errorData.eventId,
      messageId: sqsResponse.MessageId
    });

  } catch (error) {
    console.error('[Sentry Webhook] Error processing webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

/**
 * GET /sentry/health
 * Health check endpoint for monitoring
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    pipelineEnabled: errorFixConfig.enabled,
    environments: errorFixConfig.environments
  });
});

module.exports = router;
