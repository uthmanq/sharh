const express = require('express');
const router = express.Router();
const CardCollection = require('../models/CardCollection');
const Card = require('../models/Card');
const authenticateToken = require('../middleware/authenticate');

// GET all collections for the authenticated user
router.get('/', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    try {
        const collections = await CardCollection.find({ owner: req.user._id })
            .sort({ lastModified: -1 });

        const formattedCollections = collections.map(collection => ({
            id: collection._id,
            name: collection.name,
            description: collection.description,
            cardCount: collection.cards.length,
            settings: collection.settings,
            createdAt: collection.createdAt,
            lastModified: collection.lastModified
        }));

        res.json({ collections: formattedCollections });
    } catch (err) {
        console.error('Error fetching collections:', err);
        res.status(500).send('Internal Server Error');
    }
});

// GET a single collection by ID
router.get('/:collectionId', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    try {
        const collection = await CardCollection.findById(req.params.collectionId);

        if (!collection) {
            return res.status(404).send('Not Found: No collection with the given ID exists');
        }

        if (!collection.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to access this collection');
        }

        res.json({
            id: collection._id,
            name: collection.name,
            description: collection.description,
            cardCount: collection.cards.length,
            settings: collection.settings,
            createdAt: collection.createdAt,
            lastModified: collection.lastModified
        });
    } catch (err) {
        console.error('Error fetching collection:', err);
        res.status(500).send('Internal Server Error');
    }
});

// GET collection statistics
router.get('/:collectionId/stats', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    try {
        const collection = await CardCollection.findById(req.params.collectionId);

        if (!collection) {
            return res.status(404).send('Not Found: No collection with the given ID exists');
        }

        if (!collection.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to access this collection');
        }

        const stats = await collection.getStats();

        res.json({
            collectionId: collection._id,
            collectionName: collection.name,
            stats
        });
    } catch (err) {
        console.error('Error fetching collection stats:', err);
        res.status(500).send('Internal Server Error');
    }
});

// GET cards due for review in a collection
router.get('/:collectionId/due', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    try {
        const { limit } = req.query;
        const collection = await CardCollection.findById(req.params.collectionId);

        if (!collection) {
            return res.status(404).send('Not Found: No collection with the given ID exists');
        }

        if (!collection.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to access this collection');
        }

        const limitNum = limit ? parseInt(limit) : collection.settings.cardsPerDay;
        const dueCards = await collection.getDueCards(limitNum);

        const formattedCards = dueCards.map(card => ({
            id: card._id,
            front: card.front,
            back: card.back,
            easeFactor: card.easeFactor,
            interval: card.interval,
            repetitions: card.repetitions,
            nextReviewDate: card.nextReviewDate,
            lastReviewDate: card.lastReviewDate,
            tags: card.tags,
            notes: card.notes
        }));

        res.json({
            cards: formattedCards,
            count: formattedCards.length
        });
    } catch (err) {
        console.error('Error fetching due cards:', err);
        res.status(500).send('Internal Server Error');
    }
});

// GET new cards in a collection
router.get('/:collectionId/new', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    try {
        const { limit } = req.query;
        const collection = await CardCollection.findById(req.params.collectionId);

        if (!collection) {
            return res.status(404).send('Not Found: No collection with the given ID exists');
        }

        if (!collection.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to access this collection');
        }

        const limitNum = limit ? parseInt(limit) : collection.settings.newCardsPerDay;
        const newCards = await collection.getNewCards(limitNum);

        const formattedCards = newCards.map(card => ({
            id: card._id,
            front: card.front,
            back: card.back,
            tags: card.tags,
            notes: card.notes,
            createdAt: card.createdAt
        }));

        res.json({
            cards: formattedCards,
            count: formattedCards.length
        });
    } catch (err) {
        console.error('Error fetching new cards:', err);
        res.status(500).send('Internal Server Error');
    }
});

// POST create a new collection
router.post('/', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    const { name, description, settings } = req.body;

    if (!name) {
        return res.status(400).send('Bad Request: name is required');
    }

    try {
        const newCollection = new CardCollection({
            name,
            description: description || '',
            owner: req.user._id,
            settings: settings || {}
        });

        const savedCollection = await newCollection.save();

        res.status(201).json({
            id: savedCollection._id,
            name: savedCollection.name,
            description: savedCollection.description,
            cardCount: 0,
            settings: savedCollection.settings,
            createdAt: savedCollection.createdAt,
            lastModified: savedCollection.lastModified
        });
    } catch (err) {
        console.error('Error creating collection:', err);
        res.status(500).send('Internal Server Error');
    }
});

// PUT update a collection
router.put('/:collectionId', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    const { name, description, settings } = req.body;

    try {
        const collection = await CardCollection.findById(req.params.collectionId);

        if (!collection) {
            return res.status(404).send('Not Found: No collection with the given ID exists');
        }

        if (!collection.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to modify this collection');
        }

        if (name !== undefined) collection.name = name;
        if (description !== undefined) collection.description = description;
        if (settings !== undefined) {
            collection.settings = { ...collection.settings, ...settings };
        }

        const updatedCollection = await collection.save();

        res.json({
            id: updatedCollection._id,
            name: updatedCollection.name,
            description: updatedCollection.description,
            cardCount: updatedCollection.cards.length,
            settings: updatedCollection.settings,
            lastModified: updatedCollection.lastModified
        });
    } catch (err) {
        console.error('Error updating collection:', err);
        res.status(500).send('Internal Server Error');
    }
});

// DELETE a collection
router.delete('/:collectionId', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    try {
        const collection = await CardCollection.findById(req.params.collectionId);

        if (!collection) {
            return res.status(404).send('Not Found: No collection with the given ID exists');
        }

        if (!collection.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to delete this collection');
        }

        // Delete all cards in the collection
        await Card.deleteMany({ collection: collection._id });

        // Delete the collection
        await CardCollection.findByIdAndDelete(req.params.collectionId);

        res.json({ message: 'Collection and all associated cards deleted successfully' });
    } catch (err) {
        console.error('Error deleting collection:', err);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
