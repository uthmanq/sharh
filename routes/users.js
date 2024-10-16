const express = require('express');
const router = express.Router();
require('dotenv').config();
const User = require('../models/User');
const authenticateToken = require('../middleware/authenticate'); // Use your existing middleware
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const SECRET_KEY = process.env.SECRET_KEY;
const { sendEmail } = require('../scripts/sendEmail');



// POST Signup Endpoint
router.post('/signup', async (req, res) => {
    const { username, password, email } = req.body;
    if (!username || !password || !email) {
        console.log(password)
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
        // Send welcome email asynchronously
        const recipients = [savedUser.email];
        const subject = 'Welcome to Sharh App: Join the Community!';
        const html = `<p> Dear ${savedUser.username},</p>
<p> Assalamualaykum! Thank you for joining <strong>Sharh</strong>. Our vision to give users across the world access to the Ummah's written tradition. Sharh is an application aimed at redesigning how translations are read and taught. Every day, our library of translations in Kalam, Fiqh, Mantiq, Usul ul-Fiqh, and more are growing. We are pleased to have you join the Sharh community. </p>

<p> We have an exclusive members-only Telegram group that you are invited to join, where we will be posting exclusive content, updates, and discussions on everything related to translations, Kalam, Fiqh, Mantiq, and the likes. You can join the link by downloading Telegram and <a href="https://t.me/+UUYyTtJSzzAwNWIx">then joining the group here.</a>We have so many new features and new books to be announced and published! You can read more about our planned features on our front page. </p>

<p> Sincerely, </p>
<p> Uthman Qureshi (Founder and Translator of Sharh) </p>

<p>PS: If you find any benefit in the app, we would be thrilled if you chose to <a href="https://sharhapp.com/support">become a monthly supporter here</a>. It is only through the kindness of supporters like yourself that a project like this can continue. (Btw, it costs less than a cup of coffee a month.) </p>
        `;

        // Send email without affecting signup success
        sendEmail(
            recipients,
            subject,
            html,
            (info) => {
                console.log('Welcome email sent successfully', info.messageId);
            },
            (error) => {
                console.error('Failed to send welcome email', error.message);
            }
        );

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

// POST route to send an email
router.post('/admin/email', authenticateToken(['admin']), async (req, res) => {
    const { recipients, subject, html } = req.body;

    // Validate the request body to ensure all necessary fields are provided
    if (!recipients || !subject || !html) {
        return res.status(400).json({ error: 'Recipients, subject, and HTML content are required.' });
    }

    try {
        // Call the sendEmail function and pass in the success and error callbacks
        sendEmail(
            recipients,
            subject,
            html,
            (info) => {
                // Success callback: send a success response to the client
                return res.status(200).json({ message: 'Email sent successfully', messageId: info.messageId });
            },
            (error) => {
                // Error callback: send an error response to the client
                return res.status(500).json({ error: 'Failed to send email', details: error.message });
            }
        );
    } catch (err) {
        // Catch any unexpected errors and return a server error response
        return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
});

module.exports = router;

module.exports = router;
