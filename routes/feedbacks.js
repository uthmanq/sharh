const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const authenticateToken = require('../middleware/authenticate');
const getUserIdIfLoggedIn = require('../middleware/getUserIdIfLoggedIn');

// Get all feedback (admin only)
router.get('/', authenticateToken(['admin']), async (req, res) => {
    try {
        const feedback = await Feedback.find().populate('user', 'username email').sort('-createdAt');
        res.json({ feedback });
    } catch (err) {
        console.error('Error fetching feedback:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Submit new feedback (authenticated or anonymous)
router.post('/', getUserIdIfLoggedIn, async (req, res) => {
    const { type, details, sitePage } = req.body;

    if (!type || !details) {
        return res.status(400).json({ message: 'Type and details are required' });
    }

    try {
        const feedback = new Feedback({
            type,
            details,
            sitePage: sitePage || '',
            user: req.userId, // Can be null if anonymous
            status: 'New'
        });

        await feedback.save();
        res.status(201).json(feedback);
    } catch (err) {
        console.error('Error submitting feedback:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Update feedback status (admin only)
router.put('/:feedbackId/status', authenticateToken(['admin']), async (req, res) => {
    const { status } = req.body;

    if (!['New', 'InProgress', 'Completed', 'Removed'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status value' });
    }

    try {
        const feedback = await Feedback.findByIdAndUpdate(
            req.params.feedbackId,
            { status },
            { new: true }
        );

        if (!feedback) {
            return res.status(404).json({ message: 'Feedback not found' });
        }

        res.json(feedback);
    } catch (err) {
        console.error('Error updating feedback status:', err);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
