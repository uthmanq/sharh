const express = require('express');
const router = express.Router();

// Import the quiz service and models
const quizService = require('../services/QuizService');
const Book = require('../models/Book'); // Adjust path as needed
const { Quiz } = require('../models/QuizModel'); // Adjust path as needed
const authenticateToken = require('../middleware/authenticate');

// POST /generate/:bookId
// Generate a new quiz for the provided bookId (admin only)
router.post('/generate/:bookId', authenticateToken(['admin']), async (req, res) => {
    const { bookId } = req.params;
    
    if (!bookId) {
        return res.status(400).json({ error: 'bookId required' });
    }

    try {
        // First, find the book to ensure it exists
        const book = await Book.findById(bookId);
        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }

        // Generate quiz using the book object
        const quiz = await quizService.generateQuizFromBookObject(book);

        return res.status(201).json({
            id: quiz._id,
            bookId: quiz.book,
            bookTitle: quiz.bookTitle,
            questionsCount: quiz.questions.length,
            createdAt: quiz.createdAt,
            createdBy: req.user.username, // Include who created the quiz
            quiz: quiz
        });

    } catch (err) {
        console.error('Error generating quiz:', err);
        return res.status(500).json({ 
            error: err.message || 'Failed to generate quiz' 
        });
    }
});

// GET /book/:bookId
// Get all quizzes for a specific book
router.get('/book/:bookId', async (req, res) => {
    const { bookId } = req.params;
    
    if (!bookId) {
        return res.status(400).json({ error: 'bookId required' });
    }

    try {
        const quizzes = await Quiz.find({ book: bookId })
            .sort({ createdAt: -1 }) // Most recent first
            .select('_id bookTitle createdAt questions');

        if (!quizzes.length) {
            return res.status(404).json({ error: 'No quizzes found for this book' });
        }

        // Return summary info for all quizzes
        const quizSummaries = quizzes.map(quiz => ({
            id: quiz._id,
            bookTitle: quiz.bookTitle,
            questionsCount: quiz.questions.length,
            createdAt: quiz.createdAt
        }));

        return res.json({
            bookId,
            quizzes: quizSummaries,
            total: quizzes.length
        });

    } catch (err) {
        console.error('Error fetching quizzes:', err);
        return res.status(500).json({ 
            error: 'Failed to fetch quizzes' 
        });
    }
});

// GET /book/:bookId/latest
// Get the latest quiz for a book (most recently generated)
router.get('/book/:bookId/latest', async (req, res) => {
    const { bookId } = req.params;
    
    if (!bookId) {
        return res.status(400).json({ error: 'bookId required' });
    }

    try {
        const quiz = await Quiz.findOne({ book: bookId })
            .sort({ createdAt: -1 }) // Most recent first
            .populate('book', 'title author'); // Optionally populate book info

        if (!quiz) {
            return res.status(404).json({ error: 'No quiz found for this book' });
        }

        return res.json(quiz);

    } catch (err) {
        console.error('Error fetching latest quiz:', err);
        return res.status(500).json({ 
            error: 'Failed to fetch latest quiz' 
        });
    }
});

// GET /:quizId
// Get a specific quiz by its ID
router.get('/:quizId', async (req, res) => {
    const { quizId } = req.params;
    
    if (!quizId) {
        return res.status(400).json({ error: 'quizId required' });
    }

    try {
        const quiz = await Quiz.findById(quizId)
            .populate('book', 'title author category difficulty');

        if (!quiz) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        return res.json(quiz);

    } catch (err) {
        console.error('Error fetching quiz:', err);
        return res.status(500).json({ 
            error: 'Failed to fetch quiz' 
        });
    }
});

// PUT /:quizId/questions/:questionIndex
// Edit a specific question in a quiz (admin only)
router.put('/:quizId/questions/:questionIndex', authenticateToken(['admin']), async (req, res) => {
    const { quizId, questionIndex } = req.params;
    const { questionText, options, rationale } = req.body;
    
    if (!quizId || questionIndex === undefined) {
        return res.status(400).json({ error: 'quizId and questionIndex required' });
    }

    if (!questionText || !options || !rationale) {
        return res.status(400).json({ error: 'questionText, options, and rationale are required' });
    }

    // Validate options array
    if (!Array.isArray(options) || options.length !== 4) {
        return res.status(400).json({ error: 'options must be an array of exactly 4 items' });
    }

    // Validate that exactly one option is marked as correct
    const correctOptions = options.filter(option => option.isCorrect === true);
    if (correctOptions.length !== 1) {
        return res.status(400).json({ error: 'exactly one option must be marked as correct' });
    }

    // Validate that all options have text
    if (!options.every(option => option.text && typeof option.text === 'string')) {
        return res.status(400).json({ error: 'all options must have text' });
    }

    try {
        const quiz = await Quiz.findById(quizId);

        if (!quiz) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        const index = parseInt(questionIndex);
        if (index < 0 || index >= quiz.questions.length) {
            return res.status(400).json({ error: 'Invalid question index' });
        }

        // Update the specific question
        quiz.questions[index] = {
            questionText,
            options: options.map(option => ({
                text: option.text,
                isCorrect: option.isCorrect === true
            })),
            rationale
        };

        await quiz.save();

        return res.json({
            message: 'Question updated successfully',
            updatedQuestion: quiz.questions[index],
            questionIndex: index
        });

    } catch (err) {
        console.error('Error updating question:', err);
        return res.status(500).json({ 
            error: 'Failed to update question' 
        });
    }
});

// POST /:quizId/questions
// Add a new question to a quiz (admin only)
router.post('/:quizId/questions', authenticateToken(['admin']), async (req, res) => {
    const { quizId } = req.params;
    const { questionText, options, rationale } = req.body;
    
    if (!quizId) {
        return res.status(400).json({ error: 'quizId required' });
    }

    if (!questionText || !options || !rationale) {
        return res.status(400).json({ error: 'questionText, options, and rationale are required' });
    }

    // Validate options array
    if (!Array.isArray(options) || options.length !== 4) {
        return res.status(400).json({ error: 'options must be an array of exactly 4 items' });
    }

    // Validate that exactly one option is marked as correct
    const correctOptions = options.filter(option => option.isCorrect === true);
    if (correctOptions.length !== 1) {
        return res.status(400).json({ error: 'exactly one option must be marked as correct' });
    }

    // Validate that all options have text
    if (!options.every(option => option.text && typeof option.text === 'string')) {
        return res.status(400).json({ error: 'all options must have text' });
    }

    try {
        const quiz = await Quiz.findById(quizId);

        if (!quiz) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        // Create new question object
        const newQuestion = {
            questionText,
            options: options.map(option => ({
                text: option.text,
                isCorrect: option.isCorrect === true
            })),
            rationale
        };

        // Add the question to the quiz
        quiz.questions.push(newQuestion);
        await quiz.save();

        return res.status(201).json({
            message: 'Question added successfully',
            addedQuestion: newQuestion,
            questionIndex: quiz.questions.length - 1,
            totalQuestions: quiz.questions.length
        });

    } catch (err) {
        console.error('Error adding question:', err);
        return res.status(500).json({ 
            error: 'Failed to add question' 
        });
    }
});

// DELETE /:quizId/questions/:questionIndex
// Delete a specific question from a quiz (admin only)
router.delete('/:quizId/questions/:questionIndex', authenticateToken(['admin']), async (req, res) => {
    const { quizId, questionIndex } = req.params;
    
    if (!quizId || questionIndex === undefined) {
        return res.status(400).json({ error: 'quizId and questionIndex required' });
    }

    try {
        const quiz = await Quiz.findById(quizId);

        if (!quiz) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        const index = parseInt(questionIndex);
        if (index < 0 || index >= quiz.questions.length) {
            return res.status(400).json({ error: 'Invalid question index' });
        }

        // Don't allow deletion if it would leave the quiz with no questions
        if (quiz.questions.length <= 1) {
            return res.status(400).json({ error: 'Cannot delete the last question in a quiz' });
        }

        // Remove the question
        const deletedQuestion = quiz.questions[index];
        quiz.questions.splice(index, 1);
        await quiz.save();

        return res.json({
            message: 'Question deleted successfully',
            deletedQuestion,
            remainingQuestions: quiz.questions.length
        });

    } catch (err) {
        console.error('Error deleting question:', err);
        return res.status(500).json({ 
            error: 'Failed to delete question' 
        });
    }
});

// DELETE /:quizId
// Delete a specific quiz (admin only)
router.delete('/:quizId', authenticateToken(['admin']), async (req, res) => {
    const { quizId } = req.params;
    
    if (!quizId) {
        return res.status(400).json({ error: 'quizId required' });
    }

    try {
        const deletedQuiz = await Quiz.findByIdAndDelete(quizId);

        if (!deletedQuiz) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        return res.json({ 
            message: 'Quiz deleted successfully', 
            deletedQuiz: {
                id: deletedQuiz._id,
                bookTitle: deletedQuiz.bookTitle,
                createdAt: deletedQuiz.createdAt
            }
        });

    } catch (err) {
        console.error('Error deleting quiz:', err);
        return res.status(500).json({ 
            error: 'Failed to delete quiz' 
        });
    }
});

module.exports = router;