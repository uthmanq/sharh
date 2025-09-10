// bulkUpload.js
const fs = require('fs');
const axios = require('axios');

// === CONFIG ===
const API_HOST = 'https://app.ummahspot.com/books';
const BOOK_ID = '68b84dbf8102e5248198d413'; // <-- replace with your target book _id
const TOKEN = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY2ODg2MTRjYjkxMDc3ZmZhNjQwMGIxOSIsImlhdCI6MTc0NjY3NzUyM30.1k74MPqCuc0q_xveD_SJY7DNKspk5ddKYJAr3Wngm2o';
const JSON_FILE = './tahawiyyah.json'; // <-- your JSON file path

async function bulkUpload() {
  try {
    // Load JSON
    const raw = fs.readFileSync(JSON_FILE, 'utf8');
    const tahawiyyahText = JSON.parse(raw).tahawiyyahText;

    if (!Array.isArray(tahawiyyahText)) {
      throw new Error('Invalid JSON structure: tahawiyyahText must be an array');
    }

    // Flatten all lines from all sections
    const newLines = [];
    // bulkUpload.js (modified part)
for (const section of tahawiyyahText) {
    if (Array.isArray(section.lines)) {
      for (const line of section.lines) {
        let commentary = '';
  
        if (line.commentary) {
          if (typeof line.commentary === 'object') {
            // Convert object to a readable string
            commentary = Object.entries(line.commentary)
              .map(([k, v]) => `${k}: ${v}`)
              .join(' | ');
          } else {
            commentary = line.commentary;
          }
        }
  
        newLines.push({
          Arabic: line.arabic,
          English: line.english,
          commentary
        });
      }
    }
  }
  

    console.log(`Preparing to upload ${newLines.length} lines...`);

    // Send to API
    const res = await axios.post(
      `${API_HOST}/${BOOK_ID}/lines/bulk`,
      { newLines },
      {
        headers: {
          'Authorization': TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Upload complete. Response:');
    console.log(res.data);
  } catch (err) {
    console.error('Error uploading lines:', err.response?.data || err.message);
  }
}

bulkUpload();
