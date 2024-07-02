const fs = require('fs');
const https = require('https');
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
require('dotenv').config();
const path = require('path');
const { exec } = require('child_process');

const DBNAME = process.env.DBNAME;
const DBADDRESS = process.env.DBADDRESS;

app.use(bodyParser.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'build')));

mongoose.connect(`mongodb://${DBADDRESS}:27017/${DBNAME}`, {}).then(() => console.log('MongoDB Connected'));

const bookRoutes = require('./routes/books');
const userRoutes = require('./routes/users');

app.use('/books', bookRoutes);
app.use('/user', userRoutes);

app.post('/CLI-update', (req, res) => {
    if (req.body.secret !== process.env.WEBHOOK_SECRET) {
        return res.status(403).send('Invalid secret');
    }

    exec('./build.sh', (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).send('Build script failed');
        }
        
        console.log(`stdout: ${stdout}`);
        console.error(`stderr: ${stderr}`);
        res.status(200).send('Build script executed successfully');
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Set up HTTPS
const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/app.ummahspot.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/app.ummahspot.com/fullchain.pem')
};

https.createServer(options, app).listen(443, () => {
    console.log('HTTPS Server running on port 443');
});

// Redirect HTTP to HTTPS
const http = require('http');
http.createServer((req, res) => {
    res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
    res.end();
}).listen(80, () => {
    console.log('HTTP Server running on port 80 and redirecting to HTTPS');
});
