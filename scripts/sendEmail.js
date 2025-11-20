// Load environment variables - dotenv will be already loaded by the main app
// But we ensure it's loaded just in case this module is used standalone
require('dotenv').config();

const nodemailer = require('nodemailer');
const aws = require('@aws-sdk/client-ses');

// Create AWS SES client
// Use separate region for SES (emails) - defaults to us-east-1 for SES
const sesClient = new aws.SESClient({
  region: process.env.AWS_SES_REGION || process.env.AWS_REGION_SES || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Set up the Nodemailer transporter using AWS SES
const transporter = nodemailer.createTransport({
  SES: { ses: sesClient, aws },
  sendingRate: 14 // Max 14 emails/second for new SES accounts (can be increased)
});

/**
 * Sends an email to a list of recipients with the provided subject and HTML content using BCC.
 * @param {Array} recipients - List of email addresses to send the email to.
 * @param {string} subject - Subject of the email.
 * @param {string} htmlContent - HTML content of the email.
 * @param {string} replyTo - Email address where replies should be sent (optional).
 * @param {Array} attachments - Array of attachment objects (optional).
 * @param {function} successCallback - Function to call if the email is sent successfully.
 * @param {function} errorCallback - Function to call if there is an error sending the email.
 */
const sendEmail = (recipients, subject, htmlContent, replyTo, attachments, successCallback, errorCallback) => {
  // Handle backward compatibility - if replyTo is a function, it's the old signature
  let actualReplyTo = null;
  let actualAttachments = null;
  let actualSuccessCallback = successCallback;
  let actualErrorCallback = errorCallback;

  if (typeof replyTo === 'function') {
    // Old signature: sendEmail(recipients, subject, htmlContent, successCallback, errorCallback)
    actualSuccessCallback = replyTo;
    actualErrorCallback = attachments;
    actualReplyTo = null;
    actualAttachments = null;
  } else {
    // New signature with all parameters
    actualReplyTo = replyTo;
    actualAttachments = attachments;
  }

  // Validate FROM email
  const fromEmail = process.env.SES_FROM_EMAIL;
  if (!fromEmail) {
    const error = new Error('SES_FROM_EMAIL environment variable is not set');
    actualErrorCallback(error);
    return;
  }

  const mailOptions = {
    from: `"Sharh" <${fromEmail}>`,  // Must be verified in SES
    bcc: recipients.join(','),                      // BCC recipients to hide their emails from each other
    subject: subject,                               // Email subject
    html: htmlContent,                              // Email HTML content
    replyTo: actualReplyTo || process.env.SES_REPLY_TO_EMAIL || fromEmail,  // Reply-To address
    attachments: actualAttachments || []            // Attachments array
  };

  // Send the email using Nodemailer with SES
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      actualErrorCallback(error);  // Call the error callback function
    } else {
      actualSuccessCallback(info);  // Call the success callback function
    }
  });
};

/**
 * Sends individual emails to recipients (recommended for marketing emails to avoid spam filters)
 * @param {Array} recipients - List of email addresses to send the email to.
 * @param {string} subject - Subject of the email.
 * @param {string} htmlContent - HTML content of the email.
 * @param {string} replyTo - Email address where replies should be sent (optional).
 * @param {Array} attachments - Array of attachment objects (optional).
 * @param {function} successCallback - Function to call for each successful send.
 * @param {function} errorCallback - Function to call for each error.
 */
const sendIndividualEmails = async (recipients, subject, htmlContent, replyTo, attachments, successCallback, errorCallback) => {
  // Validate FROM email
  const fromEmail = process.env.SES_FROM_EMAIL;
  if (!fromEmail) {
    const error = new Error('SES_FROM_EMAIL environment variable is not set');
    recipients.forEach(recipient => errorCallback(error, recipient));
    return Promise.resolve([]);
  }

  const emailPromises = recipients.map(async (recipient) => {
    const mailOptions = {
      from: `"Sharh" <${fromEmail}>`,
      to: recipient,
      subject: subject,
      html: htmlContent,
      replyTo: replyTo || process.env.SES_REPLY_TO_EMAIL || fromEmail,  // Reply-To address
      attachments: attachments || []  // Attachments array
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      successCallback(info, recipient);
      return { success: true, recipient, messageId: info.messageId };
    } catch (error) {
      errorCallback(error, recipient);
      return { success: false, recipient, error: error.message };
    }
  });

  return Promise.allSettled(emailPromises);
};

// Example usage with attachments
const recipients = ['recipient1@example.com', 'recipient2@example.com'];
const subject = 'Test Email with Attachments';
const htmlContent = '<h1>Hello!</h1><p>This email includes attachments.</p>';
const replyToEmail = 'support@yourcompany.com';

// Example attachments array - multiple ways to specify attachments:
const attachments = [
  {
    // File from filesystem
    filename: 'document.pdf',
    path: './files/document.pdf'
  },
  {
    // File from URL
    filename: 'image.jpg',
    path: 'https://example.com/image.jpg'
  },
  {
    // Buffer/raw content
    filename: 'data.txt',
    content: Buffer.from('This is file content as a buffer')
  },
  {
    // String content
    filename: 'info.txt',
    content: 'This is plain text content',
    contentType: 'text/plain'
  },
  {
    // Base64 encoded content
    filename: 'encoded.txt',
    content: 'SGVsbG8gV29ybGQ=', // "Hello World" in base64
    encoding: 'base64'
  },
  {
    // Inline attachment (embedded in HTML)
    filename: 'logo.png',
    path: './images/logo.png',
    cid: 'logo' // Content-ID for referencing in HTML: <img src="cid:logo">
  }
];

// Success and error callback functions
const onSuccess = (info, recipient = null) => {
  const recipientMsg = recipient ? ` to ${recipient}` : '';
  console.log(`Email sent successfully${recipientMsg}:`, info.messageId);
};

const onError = (error, recipient = null) => {
  const recipientMsg = recipient ? ` to ${recipient}` : '';
  console.error(`Error sending email${recipientMsg}:`, error);
};

// Usage examples:

// 1. Send email with attachments using BCC
// sendEmail(recipients, subject, htmlContent, replyToEmail, attachments, onSuccess, onError);

// 2. Send individual emails with attachments
// sendIndividualEmails(recipients, subject, htmlContent, replyToEmail, attachments, onSuccess, onError);

// 3. Send email without attachments (backward compatibility)
// sendEmail(recipients, subject, htmlContent, onSuccess, onError);

module.exports = { sendEmail, sendIndividualEmails };
