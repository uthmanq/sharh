const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const authenticateToken = require('../middleware/authenticate');
const getUserIdIfLoggedIn = require('../middleware/getUserIdIfLoggedIn');

// Get all feedback (admin only)
router.get('/', authenticateToken(['admin']), async (req, res) => {
    try {
        const feedback = await Feedback.find()
            .populate('user', 'username email')
            .populate('assignedTo', 'username email')
            .populate('logs.addedBy', 'username email')
            .sort('-createdAt');
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

    if (!['New', 'In Progress', 'Completed', 'Removed'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status value' });
    }

    try {
        const feedback = await Feedback.findById(req.params.feedbackId);
        
        if (!feedback) {
            return res.status(404).json({ message: 'Feedback not found' });
        }
        
        // Add a log entry about the status change
        feedback.logs.push({
            message: `Status changed from "${feedback.status}" to "${status}"`,
            addedBy: req.userId
        });
        
        // Update the status
        feedback.status = status;
        
        await feedback.save();
        res.json(feedback);
    } catch (err) {
        console.error('Error updating feedback status:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Assign feedback to a user (admin only)
router.put('/:feedbackId/assign', authenticateToken(['admin']), async (req, res) => {
    const { userId } = req.body;
    
    try {
        const feedback = await Feedback.findById(req.params.feedbackId);
        
        if (!feedback) {
            return res.status(404).json({ message: 'Feedback not found' });
        }
        
        // Add a log entry about the assignment
        const previousAssignment = feedback.assignedTo ? `from ${feedback.assignedTo}` : '';
        const newAssignment = userId ? `to ${userId}` : 'removed';
        
        feedback.logs.push({
            message: `Assignment ${previousAssignment} ${newAssignment}`,
            addedBy: req.userId
        });
        
        // Update the assignment
        feedback.assignedTo = userId || null;
        
        await feedback.save();
        
        // Return populated feedback
        const updatedFeedback = await Feedback.findById(req.params.feedbackId)
            .populate('user', 'username email')
            .populate('assignedTo', 'username email')
            .populate('logs.addedBy', 'username email');
            
        res.json(updatedFeedback);
    } catch (err) {
        console.error('Error assigning feedback:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Add a log entry to feedback (admin only)
router.post('/:feedbackId/logs', authenticateToken(['admin']), async (req, res) => {
    const { message } = req.body;
    
    if (!message) {
        return res.status(400).json({ message: 'Log message is required' });
    }
    
    try {
        const feedback = await Feedback.findById(req.params.feedbackId);
        
        if (!feedback) {
            return res.status(404).json({ message: 'Feedback not found' });
        }
        
        // Add the log entry
        feedback.logs.push({
            message,
            addedBy: req.userId
        });
        
        await feedback.save();
        
        // Return populated feedback
        const updatedFeedback = await Feedback.findById(req.params.feedbackId)
            .populate('user', 'username email')
            .populate('assignedTo', 'username email')
            .populate('logs.addedBy', 'username email');
            
        res.json(updatedFeedback);
    } catch (err) {
        console.error('Error adding log entry:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Get a specific feedback item with populated fields
router.get('/:feedbackId', authenticateToken(['admin']), async (req, res) => {
    try {
        const feedback = await Feedback.findById(req.params.feedbackId)
            .populate('user', 'username email')
            .populate('assignedTo', 'username email')
            .populate('logs.addedBy', 'username email');
            
        if (!feedback) {
            return res.status(404).json({ message: 'Feedback not found' });
        }
        
        res.json(feedback);
    } catch (err) {
        console.error('Error fetching feedback:', err);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;