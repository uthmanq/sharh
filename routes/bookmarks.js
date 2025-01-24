const express = require('express');
const router = express.Router();
const Bookmark = require('../models/Bookmark');
const authenticateToken = require('../middleware/authenticate');

// Get all bookmarks for a specific book
router.get('/:bookId', authenticateToken(['editor', 'admin', 'member']), async (req, res) => {
    try {
        const bookmarks = await Bookmark.find({
            user: req.user._id,
            book: req.params.bookId
        }).sort('lineId');

        res.json({ bookmarks });
    } catch (err) {
        console.error('Error fetching bookmarks:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Get all bookmarks for a user
router.get('/user/all', authenticateToken(['editor', 'admin', 'member']), async (req, res) => {
    try {
        const bookmarks = await Bookmark.find({
            user: req.user._id
        })
        .populate({
            path: 'book',
            select: 'title lines'
        })
        .sort('-createdAt');

        const formattedBookmarks = bookmarks.map(bookmark => {
            const line = bookmark.book.lines[bookmark.lineId];
            return {
                _id: bookmark._id,
                bookId: bookmark.book._id,
                bookTitle: bookmark.book.title,
                lineId: bookmark.lineId,
                notes: bookmark.notes,
                createdAt: bookmark.createdAt,
                line: line ? {
                    Arabic: line.Arabic,
                    English: line.English,
                    commentary: line.commentary,
                    rootwords: line.rootwords
                } : null
            };
        });

        res.json({ bookmarks: formattedBookmarks });
    } catch (err) {
        console.error('Error fetching bookmarks:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Create new bookmark
router.post('/', authenticateToken(['editor', 'admin', 'member']), async (req, res) => {
    const { bookId, lineId, notes } = req.body;

    try {
        const bookmark = new Bookmark({
            user: req.user._id,
            book: bookId,
            lineId,
            notes: notes || ''
        });

        await bookmark.save();
        res.status(201).json(bookmark);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'Bookmark already exists' });
        }
        console.error('Error creating bookmark:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Update bookmark
router.put('/:bookmarkId', authenticateToken(['editor', 'admin', 'member']), async (req, res) => {
    const { notes } = req.body;

    try {
        const bookmark = await Bookmark.findOneAndUpdate(
            { 
                _id: req.params.bookmarkId,
                user: req.user._id 
            },
            { notes },
            { new: true }
        );

        if (!bookmark) {
            return res.status(404).json({ message: 'Bookmark not found' });
        }

        res.json(bookmark);
    } catch (err) {
        console.error('Error updating bookmark:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Delete bookmark
router.delete('/:bookmarkId', authenticateToken(['editor', 'admin', 'member']), async (req, res) => {
    try {
        const bookmark = await Bookmark.findOneAndDelete({
            _id: req.params.bookmarkId,
            user: req.user._id
        });

        if (!bookmark) {
            return res.status(404).json({ message: 'Bookmark not found' });
        }

        res.status(204).send();
    } catch (err) {
        console.error('Error deleting bookmark:', err);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
