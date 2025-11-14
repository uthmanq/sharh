const express = require('express');
const router = express.Router();
const Card = require('../models/Card');
const CardCollection = require('../models/CardCollection');
const authenticateToken = require('../middleware/authenticate');

// GET all cards in a collection
router.get('/collection/:collectionId', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    try {
        const collection = await CardCollection.findById(req.params.collectionId);

        if (!collection) {
            return res.status(404).send('Not Found: No collection with the given ID exists');
        }

        if (!collection.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to access this collection');
        }

        const cards = await Card.find({ collection: req.params.collectionId })
            .sort({ createdAt: -1 });

        const formattedCards = cards.map(card => ({
            id: card._id,
            front: card.front,
            back: card.back,
            easeFactor: card.easeFactor,
            interval: card.interval,
            repetitions: card.repetitions,
            nextReviewDate: card.nextReviewDate,
            lastReviewDate: card.lastReviewDate,
            tags: card.tags,
            notes: card.notes,
            createdAt: card.createdAt,
            lastModified: card.lastModified
        }));

        res.json({ cards: formattedCards });
    } catch (err) {
        console.error('Error fetching cards:', err);
        res.status(500).send('Internal Server Error');
    }
});

// GET a single card by ID
router.get('/:cardId', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    try {
        const card = await Card.findById(req.params.cardId);

        if (!card) {
            return res.status(404).send('Not Found: No card with the given ID exists');
        }

        if (!card.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to access this card');
        }

        res.json({
            id: card._id,
            front: card.front,
            back: card.back,
            easeFactor: card.easeFactor,
            interval: card.interval,
            repetitions: card.repetitions,
            nextReviewDate: card.nextReviewDate,
            lastReviewDate: card.lastReviewDate,
            collectionId: card.collection,
            tags: card.tags,
            notes: card.notes,
            createdAt: card.createdAt,
            lastModified: card.lastModified
        });
    } catch (err) {
        console.error('Error fetching card:', err);
        res.status(500).send('Internal Server Error');
    }
});

// POST create a new card
router.post('/', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    const { front, back, collectionId, tags, notes } = req.body;

    if (!front || !back || !collectionId) {
        return res.status(400).send('Bad Request: front, back, and collectionId are required');
    }

    try {
        const collection = await CardCollection.findById(collectionId);

        if (!collection) {
            return res.status(404).send('Not Found: No collection with the given ID exists');
        }

        if (!collection.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to add cards to this collection');
        }

        const newCard = new Card({
            front,
            back,
            collection: collectionId,
            owner: req.user._id,
            tags: tags || [],
            notes: notes || ''
        });

        const savedCard = await newCard.save();

        // Add card reference to collection
        collection.cards.push(savedCard._id);
        await collection.save();

        res.status(201).json({
            id: savedCard._id,
            front: savedCard.front,
            back: savedCard.back,
            easeFactor: savedCard.easeFactor,
            interval: savedCard.interval,
            repetitions: savedCard.repetitions,
            nextReviewDate: savedCard.nextReviewDate,
            lastReviewDate: savedCard.lastReviewDate,
            collectionId: savedCard.collection,
            tags: savedCard.tags,
            notes: savedCard.notes,
            createdAt: savedCard.createdAt,
            lastModified: savedCard.lastModified
        });
    } catch (err) {
        console.error('Error creating card:', err);
        res.status(500).send('Internal Server Error');
    }
});

// PUT update a card
router.put('/:cardId', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    const { front, back, tags, notes } = req.body;

    try {
        const card = await Card.findById(req.params.cardId);

        if (!card) {
            return res.status(404).send('Not Found: No card with the given ID exists');
        }

        if (!card.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to modify this card');
        }

        if (front !== undefined) card.front = front;
        if (back !== undefined) card.back = back;
        if (tags !== undefined) card.tags = tags;
        if (notes !== undefined) card.notes = notes;

        const updatedCard = await card.save();

        res.json({
            id: updatedCard._id,
            front: updatedCard.front,
            back: updatedCard.back,
            easeFactor: updatedCard.easeFactor,
            interval: updatedCard.interval,
            repetitions: updatedCard.repetitions,
            nextReviewDate: updatedCard.nextReviewDate,
            lastReviewDate: updatedCard.lastReviewDate,
            collectionId: updatedCard.collection,
            tags: updatedCard.tags,
            notes: updatedCard.notes,
            lastModified: updatedCard.lastModified
        });
    } catch (err) {
        console.error('Error updating card:', err);
        res.status(500).send('Internal Server Error');
    }
});

// POST review a card (spaced repetition)
router.post('/:cardId/review', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    const { quality } = req.body;

    if (quality === undefined || quality < 0 || quality > 5) {
        return res.status(400).send('Bad Request: quality must be a number between 0 and 5');
    }

    try {
        const card = await Card.findById(req.params.cardId);

        if (!card) {
            return res.status(404).send('Not Found: No card with the given ID exists');
        }

        if (!card.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to review this card');
        }

        await card.recordReview(quality);

        res.json({
            id: card._id,
            easeFactor: card.easeFactor,
            interval: card.interval,
            repetitions: card.repetitions,
            nextReviewDate: card.nextReviewDate,
            lastReviewDate: card.lastReviewDate,
            message: 'Review recorded successfully'
        });
    } catch (err) {
        console.error('Error reviewing card:', err);
        res.status(500).send('Internal Server Error');
    }
});

// DELETE a card
router.delete('/:cardId', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    try {
        const card = await Card.findById(req.params.cardId);

        if (!card) {
            return res.status(404).send('Not Found: No card with the given ID exists');
        }

        if (!card.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to delete this card');
        }

        // Remove card reference from collection
        await CardCollection.findByIdAndUpdate(card.collection, {
            $pull: { cards: card._id }
        });

        // Delete the card
        await Card.findByIdAndDelete(req.params.cardId);

        res.json({ message: 'Card deleted successfully' });
    } catch (err) {
        console.error('Error deleting card:', err);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
