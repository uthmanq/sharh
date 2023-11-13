const express = require('express');
const router = express.Router();
require('dotenv').config();
const User = require('../models/User')
const authenticateToken = require('../middleware/authenticate')
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.SECRETKEY

//POST Signup Endpoint
router.post('/signup', async (req, res) => {
    const { username, password, email } = req.body;
    if (!username || !password || !email) {
        return res.status(400).send('Bad Request: Missing required fields');
    }
    try {
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.status(400).send('Bad Request: User with the same username or email already exists');
        }
        const newUser = new User({ username, password, email });
        const savedUser = await newUser.save();
        const token = jwt.sign({ id: savedUser._id }, SECRET_KEY, {
            //  No expiry needed but otherwise, you can uncomment next line.
            //  expiresIn: '24h' 
        });
        res.status(201).json({ token, user: { id: savedUser._id, username: savedUser.username, email: savedUser.email } });
    } catch (err) {
        console.log(err)
        res.status(500).send('Internal Server Error');
    }
});

//POST Login Endpoint
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).send('Bad Request: Missing required fields');
    }
    try {
        const user = await User.findOne({ username });
        if (!user || user.password !== password) {
            return res.status(401).send('Unauthorized: Incorrect username or password');
        }
        const token = jwt.sign({ id: user._id }, SECRET_KEY, { expiresIn: '24h' });
        res.status(200).json({ token, user: { id: user._id, username: user.username, email: user.email } });
    } catch (err) {
        console.log(err)
        res.status(500).send('Internal Server Error');
    }
});

router.get('/', authenticateToken, async (req, res) => {
    try {
        // Assuming the JWT token contains the user's ID in the 'id' field
        const user = await User.findById(req.user.id).select('-password'); // Exclude the password from the result
        if (!user) {
            return res.status(404).send('User not found');
        }
        res.json(user);
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
