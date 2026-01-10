/**
 * Test script to verify SQS connectivity
 *
 * Usage: node test-sqs.js [send|receive|both]
 */

require('dotenv').config();
const {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand
} = require('@aws-sdk/client-sqs');

const sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'us-east-2' });
const queueUrl = process.env.SQS_ERROR_FIX_QUEUE_URL;

async function checkQueue() {
  console.log('=== Checking SQS Queue ===');
  console.log('Queue URL:', queueUrl);
  console.log('Region:', process.env.AWS_REGION || 'us-east-2');

  try {
    const command = new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible']
    });
    const response = await sqsClient.send(command);
    console.log('✅ Queue accessible');
    console.log('   Messages available:', response.Attributes.ApproximateNumberOfMessages);
    console.log('   Messages in flight:', response.Attributes.ApproximateNumberOfMessagesNotVisible);
    return true;
  } catch (error) {
    console.error('❌ Failed to access queue:', error.message);
    return false;
  }
}

async function sendTestMessage() {
  console.log('\n=== Sending Test Message ===');

  const testErrorData = {
    eventId: `sqs-test-${Date.now()}`,
    errorType: 'TestError',
    errorMessage: 'This is a test error from SQS test script',
    fileName: 'test.js',
    lineNumber: 42,
    functionName: 'testFunction',
    stackTrace: '[]',
    environment: 'development',
    timestamp: new Date().toISOString()
  };

  try {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(testErrorData),
      MessageAttributes: {
        JobType: { DataType: 'String', StringValue: 'error-fix' },
        Environment: { DataType: 'String', StringValue: 'development' }
      }
    });

    const response = await sqsClient.send(command);
    console.log('✅ Message sent successfully');
    console.log('   Message ID:', response.MessageId);
    console.log('   Event ID:', testErrorData.eventId);
    return response.MessageId;
  } catch (error) {
    console.error('❌ Failed to send message:', error.message);
    return null;
  }
}

async function receiveTestMessage() {
  console.log('\n=== Receiving Messages ===');

  try {
    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 5,
      VisibilityTimeout: 30,
      MessageAttributeNames: ['All']
    });

    const response = await sqsClient.send(command);

    if (!response.Messages || response.Messages.length === 0) {
      console.log('ℹ️  No messages in queue');
      return null;
    }

    const message = response.Messages[0];
    const body = JSON.parse(message.Body);

    console.log('✅ Message received');
    console.log('   Message ID:', message.MessageId);
    console.log('   Event ID:', body.eventId);
    console.log('   Error Type:', body.errorType);
    console.log('   Error Message:', body.errorMessage);

    // Ask if we should delete it
    return message;
  } catch (error) {
    console.error('❌ Failed to receive message:', error.message);
    return null;
  }
}

async function deleteMessage(receiptHandle) {
  try {
    const command = new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle
    });
    await sqsClient.send(command);
    console.log('✅ Message deleted from queue');
  } catch (error) {
    console.error('❌ Failed to delete message:', error.message);
  }
}

async function main() {
  const action = process.argv[2] || 'both';

  if (!queueUrl) {
    console.error('❌ SQS_ERROR_FIX_QUEUE_URL not set in .env');
    process.exit(1);
  }

  // Always check queue first
  const queueOk = await checkQueue();
  if (!queueOk) {
    process.exit(1);
  }

  if (action === 'send' || action === 'both') {
    await sendTestMessage();
  }

  if (action === 'receive' || action === 'both') {
    const message = await receiveTestMessage();
    if (message) {
      console.log('\n=== Cleaning up test message ===');
      await deleteMessage(message.ReceiptHandle);
    }
  }

  console.log('\n=== SQS Test Complete ===');
}

main().catch(console.error);
