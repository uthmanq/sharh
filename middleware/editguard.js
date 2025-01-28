const jwt = require('jsonwebtoken');
const Book = require('../models/Book');
const User = require('../models/User');
const SECRET_KEY = process.env.SECRET_KEY;

/**
 * Middleware to check if a user has permission to modify a book
 * @param {Object} options - Configuration options
 * @param {boolean} options.requireBook - Whether to fetch and verify book existence
 * @returns {Function} Express middleware
 */
const authorizeBookAccess = ({ requireBook = true } = {}) => {
    return async (req, res, next) => {
        const token = req.header('Authorization')?.split(' ')[1];
        
        if (!token) {
            return res.status(401).send('Unauthorized: No token provided');
        }

        try {
            // Verify token and get user
            const decoded = jwt.verify(token, SECRET_KEY);
            const user = await User.findById(decoded.id);
            
            if (!user) {
                return res.status(404).send('User not found');
            }

            // Store user in request
            req.user = user;

            // If user is admin, they have full access
            if (user.roles.includes('admin')) {
                return next();
            }

            // If book verification is not required (e.g., for creation endpoints)
            if (!requireBook) {
                return next();
            }

            // Get bookId from params
            const bookId = req.params.bookId;
            if (!bookId) {
                return res.status(400).send('Bad Request: Book ID is required');
            }

            // Find the book
            const book = await Book.findById(bookId);
            if (!book) {
                return res.status(404).send('Not Found: No book with the given ID exists');
            }

            // Check if user is owner or contributor
            const isOwner = book.owner.equals(user._id);
            const isContributor = book.contributors.some(contributorId => 
                contributorId.equals(user._id)
            );

            if (!isOwner && !isContributor) {
                return res.status(403).send('Forbidden: You do not have permission to modify this book');
            }

            // Store book in request for later use
            req.book = book;
            next();
        } catch (err) {
            if (err.name === 'JsonWebTokenError') {
                return res.status(403).send('Forbidden: Invalid token');
            }
            console.error('Error in book authorization:', err);
            res.status(500).send('Internal Server Error');
        }
    };
};

module.exports = authorizeBookAccess;
