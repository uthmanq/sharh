const AWS = require('aws-sdk');
const fs = require('fs');
require('dotenv').config({ path: '../.env' });

// Initialize the S3 client
const s3 = new AWS.S3({
  region: process.env.AWS_REGION, // Make sure your region is set in .env
});

// Function to upload a file to S3
const uploadFile = async (filePath, s3Key) => {
  try {
    const fileContent = fs.readFileSync(filePath);

    const params = {
      Bucket: 'sharh-app-pdfs', // Your bucket name
      Key: s3Key, // The key (file name with path) in the S3 bucket
      Body: fileContent,
    };

    const data = await s3.upload(params).promise();
    console.log('File uploaded successfully:', data);
    return data; // Return the data with file details
  } catch (err) {
    console.error('Error uploading file:', err.message);
    throw err; // Throw the error to be handled in the API
  }
};

// Function to download a file from S3
const downloadFile = async (s3Key, downloadPath) => {
  try {
    const params = {
      Bucket: 'sharh-app-pdfs', // Your bucket name
      Key: s3Key, // The key (file name with path) in the S3 bucket
    };

    const data = await s3.getObject(params).promise();
    fs.writeFileSync(downloadPath, data.Body); // Write the downloaded file to local disk
    console.log(`File downloaded successfully to ${downloadPath}`);
    return data;
  } catch (err) {
    console.error('Error downloading file:', err.message);
    throw err; // Throw the error to be handled in the API
  }
};

// Function to download a file from S3 as a stream (for piping directly to response)
const getFileStream = (s3Key) => {
    const params = {
      Bucket: 'sharh-app-pdfs', // Your bucket name
      Key: s3Key, // The S3 key (file path)
    };
    return s3.getObject(params).createReadStream(); // Return the S3 file stream
  };
  

// Function to list all objects in the S3 bucket
const listFiles = async () => {
  const params = {
    Bucket: 'sharh-app-pdfs', // Your bucket name
  };

  try {
    const data = await s3.listObjectsV2(params).promise();
    console.log('Bucket contents:', data.Contents);
    return data.Contents; // Return the list of files
  } catch (err) {
    console.error('Error listing bucket contents:', err.message);
    throw err; // Throw the error to be handled in the API
  }
};

// Function to delete a file from S3
const deleteFile = async (s3Key) => {
  try {
    const params = {
      Bucket: 'sharh-app-pdfs', // Your bucket name
      Key: s3Key, // The key (file name with path) in the S3 bucket
    };

    const data = await s3.deleteObject(params).promise();
    console.log('File deleted successfully from S3:', data);
    return data; // Return the deletion data
  } catch (err) {
    console.error('Error deleting file from S3:', err.message);
    throw err; // Throw the error to be handled in the API
  }
};



// Function to get a pre-signed URL for viewing the file
const getPresignedUrl = async (s3Key, expiresIn = 60) => {
    try {
      const params = {
        Bucket: 'sharh-app-pdfs', // Your bucket name
        Key: s3Key, // The key (file name with path) in the S3 bucket
        Expires: expiresIn, // Expiration time in seconds (default is 60)
        ResponseContentDisposition: 'inline' // Makes the file viewable in the browser
      };
  
      const url = await s3.getSignedUrlPromise('getObject', params);
      console.log('Generated pre-signed URL:', url);
      return url;
    } catch (err) {
      console.error('Error generating pre-signed URL:', err.message);
      throw err; // Throw the error to be handled in the API
    }
  };
  
  // Export the new function as well
  module.exports = {
    uploadFile,
    downloadFile,
    listFiles,
    getFileStream,
    deleteFile,
    getPresignedUrl // New pre-signed URL function
  };
  