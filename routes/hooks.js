const express = require('express');
const router = express.Router();
require('dotenv').config();
const User = require('../models/User');
const authenticateToken = require('../middleware/authenticate'); // Use your existing middleware
const asyncHandler = require('../middleware/asyncHandler');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const SECRET_KEY = process.env.SECRET_KEY;
const { sendEmail } = require('../scripts/sendEmail');

router.post('/new-product', asyncHandler(async (req, res) => {
    // TODO: Implement new product webhook handler
    res.status(501).json({ error: 'Not implemented' });
}));



module.exports = router;
