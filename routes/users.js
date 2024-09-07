const express = require('express');
const router = express.Router();
require('dotenv').config();
const User = require('../models/User');
const authenticateToken = require('../middleware/authenticate'); // Use your existing middleware
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const SECRET_KEY = process.env.SECRET_KEY;



// POST Signup Endpoint
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

        // Create a new Stripe customer
        const customer = await stripe.customers.create({
            email: email,
            name: username,
        });

        const newUser = new User({ username, password, email, stripeCustomerId: customer.id });
        const savedUser = await newUser.save();

        const token = jwt.sign({ id: savedUser._id }, SECRET_KEY, {
            expiresIn: '24h'
        });

        res.status(201).json({ token, user: { id: savedUser._id, username: savedUser.username, email: savedUser.email, stripeCustomerId: savedUser.stripeCustomerId, roles: savedUser.roles } });
    } catch (err) {
        console.log(err);
        res.status(500).send('Internal Server Error');
    }
});

// POST Login Endpoint
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).send('Bad Request: Missing required fields');
    }
    try {
        const user = await User.findOne({ username });
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).send('Unauthorized: Incorrect username or password');
        }
        const token = jwt.sign({ id: user._id }, SECRET_KEY);
        res.status(200).json({ token, user: { id: user._id, username: user.username, email: user.email, stripeCustomerId: user.stripeCustomerId, roles: user.roles } });
    } catch (err) {
        console.log(err);
        res.status(500).send('Internal Server Error');
    }
});

// GET User Profile (Protected)
router.get('/', authenticateToken(), async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password'); // Exclude the password from the result
        if (!user) {
            return res.status(404).send('User not found');
        }
        res.json(user);
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
});

// ADMIN ROUTES

// Update user details (Admin Only)
router.put('/admin/user/:id', authenticateToken(['admin']), async (req, res) => {
    const { id } = req.params;
    const { username, email, roles } = req.body;

    try {
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).send('User not found');
        }

        // Update user details
        if (username) user.username = username;
        if (email) user.email = email;
        if (roles) user.roles = roles;

        await user.save();
        res.status(200).json({ message: 'User updated successfully', user });
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
});

// Add or remove roles (Admin Only)
router.put('/admin/user/:id/roles', authenticateToken(['admin']), async (req, res) => {
    const { id } = req.params;
    const { roles } = req.body;

    try {
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).send('User not found');
        }

        // Update roles
        user.roles = roles;
        await user.save();

        res.status(200).json({ message: 'User roles updated successfully', user });
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
});

// Delete user (Admin Only)
router.delete('/admin/user/:id', authenticateToken(['admin']), async (req, res) => {
    const { id } = req.params;

    try {
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).send('User not found');
        }

        await user.deleteOne(); // Use deleteOne() instead of remove()
        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).send('Internal Server Error');
    }
});



// Fetch all users (Admin Only)
router.get('/admin/users', authenticateToken(['admin']), async (req, res) => {
    try {
        const users = await User.find().select('-password'); // Fetch all users excluding passwords
        res.status(200).json(users);
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
