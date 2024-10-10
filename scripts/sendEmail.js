// Load environment variables from the parent directory's .env file
require('dotenv').config({ path: '../.env' });

const nodemailer = require('nodemailer');

// Set up the Nodemailer transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,   // Your Gmail address from .env file
    pass: process.env.GMAIL_APP_PASS // Your App Password from .env file
  }
});

/**
 * Sends an email to a list of recipients with the provided subject and HTML content using BCC.
 * @param {Array} recipients - List of email addresses to send the email to.
 * @param {string} subject - Subject of the email.
 * @param {string} htmlContent - HTML content of the email.
 * @param {function} successCallback - Function to call if the email is sent successfully.
 * @param {function} errorCallback - Function to call if there is an error sending the email.
 */
const sendEmail = (recipients, subject, htmlContent, successCallback, errorCallback) => {
  const mailOptions = {
    from: `"Your App" <${process.env.GMAIL_USER}>`,  // Sender address
    bcc: recipients.join(','),                      // BCC recipients to hide their emails from each other
    subject: subject,                               // Email subject
    html: htmlContent                               // Email HTML content
  };

  // Send the email using Nodemailer
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      errorCallback(error);  // Call the error callback function
    } else {
      successCallback(info);  // Call the success callback function
    }
  });
};

// Example usage of the sendEmail function
const recipients = ['recipient1@example.com', 'recipient2@example.com'];
const subject = 'Test Email from Node.js';
const htmlContent = '<h1>Hello!</h1><p>This is a test email sent using Node.js and Nodemailer.</p>';

// Success and error callback functions
const onSuccess = (info) => {
  console.log('Email sent successfully:', info.messageId);
};

const onError = (error) => {
  console.error('Error sending email:', error);
};

// Calling the sendEmail function
sendEmail(recipients, subject, htmlContent, onSuccess, onError);

module.exports = { sendEmail };
