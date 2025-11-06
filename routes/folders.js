const express = require('express');
const router = express.Router();
const Folder = require('../models/Folder');
const Note = require('../models/Note');
const authenticateToken = require('../middleware/authenticate');

// GET all folders for the authenticated user
router.get('/', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    try {
        const folders = await Folder.find({ owner: req.user._id })
            .populate('notes', 'title lastModified')
            .sort({ lastModified: -1 });

        const formattedFolders = folders.map(folder => ({
            id: folder._id,
            name: folder.name,
            description: folder.description,
            noteCount: folder.notes.length,
            notes: folder.notes.map(note => ({
                id: note._id,
                title: note.title,
                lastModified: note.lastModified
            })),
            createdAt: folder.createdAt,
            lastModified: folder.lastModified
        }));

        res.json({ folders: formattedFolders });
    } catch (err) {
        console.error('Error fetching folders:', err);
        res.status(500).send('Internal Server Error');
    }
});

// GET a single folder by ID
router.get('/:folderId', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    try {
        const folder = await Folder.findById(req.params.folderId)
            .populate('notes', 'title lastModified');

        if (!folder) {
            return res.status(404).send('Not Found: No folder with the given ID exists');
        }

        // Verify ownership
        if (!folder.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to access this folder');
        }

        const formattedFolder = {
            id: folder._id,
            name: folder.name,
            description: folder.description,
            notes: folder.notes.map(note => ({
                id: note._id,
                title: note.title,
                lastModified: note.lastModified
            })),
            createdAt: folder.createdAt,
            lastModified: folder.lastModified
        };

        res.json(formattedFolder);
    } catch (err) {
        console.error('Error fetching folder:', err);
        res.status(500).send('Internal Server Error');
    }
});

// POST create a new folder
router.post('/', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    const { name, description } = req.body;

    if (!name) {
        return res.status(400).send('Bad Request: Folder name is required');
    }

    try {
        const newFolder = new Folder({
            name,
            description: description || '',
            owner: req.user._id
        });

        const savedFolder = await newFolder.save();

        const formattedFolder = {
            id: savedFolder._id,
            name: savedFolder.name,
            description: savedFolder.description,
            notes: [],
            createdAt: savedFolder.createdAt,
            lastModified: savedFolder.lastModified
        };

        res.status(201).json(formattedFolder);
    } catch (err) {
        console.error('Error creating folder:', err);
        res.status(500).send('Internal Server Error');
    }
});

// PUT update a folder
router.put('/:folderId', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    const { name, description } = req.body;

    try {
        const folder = await Folder.findById(req.params.folderId);

        if (!folder) {
            return res.status(404).send('Not Found: No folder with the given ID exists');
        }

        // Verify ownership
        if (!folder.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to modify this folder');
        }

        if (name) folder.name = name;
        if (description !== undefined) folder.description = description;

        const updatedFolder = await folder.save();

        const formattedFolder = {
            id: updatedFolder._id,
            name: updatedFolder.name,
            description: updatedFolder.description,
            lastModified: updatedFolder.lastModified
        };

        res.json(formattedFolder);
    } catch (err) {
        console.error('Error updating folder:', err);
        res.status(500).send('Internal Server Error');
    }
});

// DELETE a folder
router.delete('/:folderId', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    try {
        const folder = await Folder.findById(req.params.folderId);

        if (!folder) {
            return res.status(404).send('Not Found: No folder with the given ID exists');
        }

        // Verify ownership
        if (!folder.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to delete this folder');
        }

        // Delete all notes in the folder
        await Note.deleteMany({ folder: folder._id });

        // Delete the folder
        await Folder.findByIdAndDelete(req.params.folderId);

        res.json({ message: 'Folder and all its notes deleted successfully' });
    } catch (err) {
        console.error('Error deleting folder:', err);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
