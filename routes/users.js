const express = require('express');
const router = express.Router();
require('dotenv').config();
const User = require('../models/User');
const authenticateToken = require('../middleware/authenticate'); // Use your existing middleware
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const stripeConfig = require('../config/stripeConfig')
const stripe = require('stripe')(stripeConfig.secretKey);
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
    const { identifier, password } = req.body; // Accepts either username or email as "identifier"

    if (!identifier || !password) {
        return res.status(400).send('Bad Request: Missing required fields');
    }

    try {
        // Search for user by username or email
        const user = await User.findOne({ 
            $or: [{ username: identifier }, { email: identifier }] 
        });

        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).send('Unauthorized: Incorrect credentials');
        }

        const token = jwt.sign({ id: user._id }, SECRET_KEY);
        res.status(200).json({ 
            token, 
            user: { 
                id: user._id, 
                username: user.username, 
                email: user.email, 
                stripeCustomerId: user.stripeCustomerId, 
                roles: user.roles 
            } 
        });
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


/**
 * @swagger
 * /user/forgot-password:
 *   post:
 *     summary: Send password reset email
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address of the user
 *     responses:
 *       200:
 *         description: Password reset email sent (always returns success for security)
 *       400:
 *         description: Bad request - invalid email format
 *       500:
 *         description: Internal server error
 */
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        // Validate email
        if (!email || !email.includes('@')) {
            return res.status(400).json({
                error: 'Valid email address is required'
            });
        }

        // Find user by email
        const user = await User.findOne({ email: email.toLowerCase() });

        // Always return success for security (don't reveal if email exists)
        if (!user) {
            return res.status(200).json({
                message: 'If an account with that email exists, a password reset link has been sent'
            });
        }

        // Generate reset token (expires in 1 hour)
        const resetToken = jwt.sign(
            {
                id: user._id,
                email: user.email,
                type: 'password-reset'
            },
            SECRET_KEY,
            { expiresIn: '1h' }
        );

        // Store reset token in user document (optional - for additional security)
        user.passwordResetToken = resetToken;
        user.passwordResetExpires = new Date(Date.now() + 3600000); // 1 hour
        await user.save();

        // Create reset URL (adjust domain as needed)
        const resetUrl = `https://sharhapp.com/reset-password?token=${resetToken}`;

        // Send password reset email
        const recipients = [user.email];
        const subject = 'Password Reset Request - Sharh';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Password Reset Request</h2>
                <p>Dear ${user.firstName || user.username},</p>
                <p>You have requested to reset your password for your Sharh account.</p>
                <p>Please click the link below to reset your password:</p>
                <p style="margin: 20px 0;">
                    <a href="${resetUrl}" 
                       style="background-color: #007bff; color: white; padding: 12px 24px; 
                              text-decoration: none; border-radius: 4px; display: inline-block;">
                        Reset Password
                    </a>
                </p>
                <p><strong>This link will expire in 1 hour.</strong></p>
                <p>If you did not request this password reset, please ignore this email and your password will remain unchanged.</p>
                <p>For security reasons, please do not share this link with anyone.</p>
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
                <p style="color: #666; font-size: 12px;">
                    If the button above doesn't work, copy and paste this link into your browser:<br>
                    <a href="${resetUrl}">${resetUrl}</a>
                </p>
            </div>
        `;

        // Send email without affecting the response
        sendEmail(
            recipients,
            subject,
            html,
            (info) => {
                console.log('Password reset email sent successfully', info.messageId);
            },
            (error) => {
                console.error('Failed to send password reset email', error.message);
            }
        );

        res.status(200).json({
            message: 'If an account with that email exists, a password reset link has been sent'
        });

    } catch (error) {
        console.error('Error in forgot password:', error);
        res.status(500).json({ error: 'Internal Server Error' });
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
