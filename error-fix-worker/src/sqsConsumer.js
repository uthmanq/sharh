const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand
} = require('@aws-sdk/client-sqs');
const config = require('./config');

class SQSConsumer {
  constructor() {
    this.client = new SQSClient({ region: config.aws.region });
    this.queueUrl = config.aws.sqsQueueUrl;
  }

  /**
   * Poll for messages from the queue
   * @returns {Promise<Array>} Array of messages
   */
  async receiveMessages() {
    const command = new ReceiveMessageCommand({
      QueueUrl: this.queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 20, // Long polling
      VisibilityTimeout: config.worker.visibilityTimeout,
      MessageAttributeNames: ['All']
    });

    try {
      const response = await this.client.send(command);
      return response.Messages || [];
    } catch (error) {
      console.error('[SQS] Error receiving messages:', error.message);
      return [];
    }
  }

  /**
   * Delete a message after successful processing
   * @param {string} receiptHandle - The receipt handle of the message
   */
  async deleteMessage(receiptHandle) {
    const command = new DeleteMessageCommand({
      QueueUrl: this.queueUrl,
      ReceiptHandle: receiptHandle
    });

    try {
      await this.client.send(command);
      console.log('[SQS] Message deleted successfully');
    } catch (error) {
      console.error('[SQS] Error deleting message:', error.message);
      throw error;
    }
  }

  /**
   * Parse error data from SQS message
   * @param {object} message - SQS message
   * @returns {object} Parsed error data
   */
  parseMessage(message) {
    try {
      return JSON.parse(message.Body);
    } catch (error) {
      console.error('[SQS] Error parsing message body:', error.message);
      return null;
    }
  }
}

module.exports = SQSConsumer;
