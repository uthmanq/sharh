const SQSConsumer = require('./sqsConsumer');
const DockerManager = require('./dockerManager');
const SentryClient = require('./sentryClient');
const config = require('./config');

class ErrorFixWorker {
  constructor(options = {}) {
    this.sqsConsumer = new SQSConsumer();
    this.dockerManager = new DockerManager();
    this.sentryClient = new SentryClient();
    this.isRunning = false;
    this.processingJobs = new Set();
    this.testMode = options.testMode || false;
    this.clearQueue = options.clearQueue || false;
  }

  /**
   * Start the worker
   */
  async start() {
    if (this.clearQueue) {
      console.log('[Worker] Starting in CLEAR QUEUE MODE - will delete all messages from queue');
      await this.clearAllMessages();
      return;
    }

    if (this.testMode) {
      console.log('[Worker] Starting in TEST MODE - will read and enrich message but NOT process with Claude');
      await this.testSentryMessage();
      return;
    }

    console.log('[Worker] Starting error-fix worker...');
    console.log(`[Worker] Max concurrent jobs: ${config.worker.maxConcurrentJobs}`);
    console.log(`[Worker] Docker image: ${config.docker.image}`);
    console.log(`[Worker] GitHub repo: ${config.github.repo}`);

    // Validate configuration
    if (!config.aws.sqsQueueUrl) {
      throw new Error('SQS_ERROR_FIX_QUEUE_URL is not configured');
    }
    if (!config.github.token) {
      throw new Error('GITHUB_TOKEN is not configured');
    }
    if (!config.anthropic.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    this.isRunning = true;
    this.poll();
  }

  /**
   * Test mode: Read one message, enrich it, and display (no processing)
   */
  async testSentryMessage() {
    console.log('[Test] Polling for one message from SQS...');

    if (!config.aws.sqsQueueUrl) {
      throw new Error('SQS_ERROR_FIX_QUEUE_URL is not configured');
    }

    const messages = await this.sqsConsumer.receiveMessages();

    if (messages.length === 0) {
      console.log('[Test] No messages in queue. Trigger an error in Sentry and try again.');
      return;
    }

    const message = messages[0];
    console.log('\n' + '='.repeat(80));
    console.log('[Test] RAW SQS MESSAGE:');
    console.log('='.repeat(80));
    console.log(JSON.stringify(message, null, 2));

    const errorData = this.sqsConsumer.parseMessage(message);

    if (!errorData) {
      console.error('[Test] Failed to parse message body');
      return;
    }

    console.log('\n' + '='.repeat(80));
    console.log('[Test] PARSED ERROR DATA (from webhook):');
    console.log('='.repeat(80));
    console.log(JSON.stringify(errorData, null, 2));

    console.log('\n[Test] Fetching full error details from Sentry API...');

    if (!config.sentry.authToken) {
      console.warn('[Test] WARNING: SENTRY_AUTH_TOKEN not configured - cannot enrich data');
      console.log('[Test] Add SENTRY_AUTH_TOKEN to your .env file to fetch full stack traces');
      return;
    }

    const enrichedData = await this.sentryClient.enrichErrorData(errorData);

    console.log('\n' + '='.repeat(80));
    console.log('[Test] ENRICHED ERROR DATA (from Sentry API):');
    console.log('='.repeat(80));
    console.log(JSON.stringify(enrichedData, null, 2));

    // Show a summary of what was enriched
    console.log('\n' + '='.repeat(80));
    console.log('[Test] ENRICHMENT SUMMARY:');
    console.log('='.repeat(80));
    console.log(`Error Type: ${enrichedData.errorType}`);
    console.log(`Error Message: ${enrichedData.errorMessage}`);
    console.log(`File: ${enrichedData.fileName || 'N/A'}`);
    console.log(`Line: ${enrichedData.lineNumber || 'N/A'}`);
    console.log(`Function: ${enrichedData.functionName || 'N/A'}`);

    const stackTrace = JSON.parse(enrichedData.stackTrace || '[]');
    console.log(`Stack Frames: ${stackTrace.length}`);

    if (enrichedData.breadcrumbs?.length) {
      console.log(`Breadcrumbs: ${enrichedData.breadcrumbs.length}`);
    }

    console.log('\n[Test] Message NOT deleted from queue (will be available for actual processing)');
    console.log('[Test] Done.');
  }

  /**
   * Clear all messages from the queue
   */
  async clearAllMessages() {
    if (!config.aws.sqsQueueUrl) {
      throw new Error('SQS_ERROR_FIX_QUEUE_URL is not configured');
    }

    console.log('[Clear] Starting to clear queue...');
    let totalDeleted = 0;

    while (true) {
      const messages = await this.sqsConsumer.receiveMessages();

      if (messages.length === 0) {
        console.log(`[Clear] Queue is empty. Total messages deleted: ${totalDeleted}`);
        break;
      }

      for (const message of messages) {
        await this.sqsConsumer.deleteMessage(message.ReceiptHandle);
        totalDeleted++;
        console.log(`[Clear] Deleted message ${totalDeleted}: ${message.MessageId}`);
      }
    }

    console.log('[Clear] Done.');
  }

  /**
   * Main polling loop
   */
  async poll() {
    while (this.isRunning) {
      try {
        // Check if we can process more jobs
        if (this.dockerManager.getActiveCount() >= config.worker.maxConcurrentJobs) {
          console.log('[Worker] At max concurrent jobs, waiting...');
          await this.sleep(config.worker.pollIntervalMs);
          continue;
        }

        // Poll for messages
        const messages = await this.sqsConsumer.receiveMessages();

        if (messages.length === 0) {
          // No messages, continue polling
          continue;
        }

        // Process each message
        for (const message of messages) {
          await this.processMessage(message);
        }

      } catch (error) {
        console.error('[Worker] Error in poll loop:', error.message);
        await this.sleep(config.worker.pollIntervalMs);
      }
    }
  }

  /**
   * Process a single SQS message
   * @param {object} message - SQS message
   */
  async processMessage(message) {
    console.log('[Worker] Raw SQS message:', JSON.stringify(message, null, 2));

    let errorData = this.sqsConsumer.parseMessage(message);

    console.log('[Worker] Parsed error data from SQS:', JSON.stringify(errorData, null, 2));

    if (!errorData) {
      console.error('[Worker] Invalid message, deleting');
      await this.sqsConsumer.deleteMessage(message.ReceiptHandle);
      return;
    }

    // Enrich error data with full details from Sentry API
    console.log('[Worker] Fetching full error details from Sentry API...');
    errorData = await this.sentryClient.enrichErrorData(errorData);

    console.log('[Worker] Enriched error data:', JSON.stringify(errorData, null, 2));

    const jobId = `${errorData.eventId}-${Date.now()}`;

    console.log(`[Worker] Processing job ${jobId}`);
    console.log(`[Worker] Error: ${errorData.errorType} - ${errorData.errorMessage}`);
    console.log(`[Worker] File: ${errorData.fileName}:${errorData.lineNumber}`);

    try {
      // Run Docker container to fix the error
      const result = await this.dockerManager.runFixContainer(jobId, errorData);

      if (result.success) {
        console.log(`[Worker] Job ${jobId} completed successfully`);
        console.log('[Worker] Container logs:', result.logs.slice(-1000)); // Last 1000 chars

        // Delete message from queue
        await this.sqsConsumer.deleteMessage(message.ReceiptHandle);
      } else {
        console.error(`[Worker] Job ${jobId} failed with exit code ${result.exitCode}`);
        console.error('[Worker] Container logs:', result.logs.slice(-2000));

        // Don't delete - message will return to queue after visibility timeout
        // After 3 failures, it will go to DLQ
      }

    } catch (error) {
      console.error(`[Worker] Error processing job ${jobId}:`, error.message);
      // Message will return to queue after visibility timeout
    }
  }

  /**
   * Stop the worker gracefully
   */
  async stop() {
    console.log('[Worker] Stopping worker...');
    this.isRunning = false;

    // Stop all active containers
    await this.dockerManager.stopAll();

    console.log('[Worker] Worker stopped');
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const testMode = args.includes('--test-sentry-message');
const clearQueue = args.includes('--clear-queue');

// Main entry point
const worker = new ErrorFixWorker({ testMode, clearQueue });

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Worker] Received SIGINT');
  await worker.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Worker] Received SIGTERM');
  await worker.stop();
  process.exit(0);
});

// Start the worker
worker.start().catch(error => {
  console.error('[Worker] Failed to start:', error.message);
  process.exit(1);
});
