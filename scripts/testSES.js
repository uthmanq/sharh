require('dotenv').config();
const { sendEmail } = require('./sendEmail');

// Test sending an email
const recipients = ['test@example.com']; // You can use your own email for testing
const subject = 'Test Email from SES';
const htmlContent = '<h1>Test Email</h1><p>This is a test email from AWS SES.</p>';

console.log('Testing SES with configuration:');
console.log('AWS_REGION:', process.env.AWS_REGION);
console.log('SES_FROM_EMAIL:', process.env.SES_FROM_EMAIL);
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? 'Set' : 'Not set');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? 'Set' : 'Not set');
console.log('\nAttempting to send email...\n');

sendEmail(
  recipients,
  subject,
  htmlContent,
  (info) => {
    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info);
  },
  (error) => {
    console.error('❌ Failed to send email:');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Full error:', error);
  }
);
