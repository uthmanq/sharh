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
    // existing code
});

// POST Login Endpoint
router.post('/login', async (req, res) => {
    // existing code
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

        await user.remove();
        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
