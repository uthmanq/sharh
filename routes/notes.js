const express = require('express');
const router = express.Router();
const Note = require('../models/Note');
const Folder = require('../models/Folder');
const authenticateToken = require('../middleware/authenticate');

// GET all notes for a specific folder
router.get('/folder/:folderId', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    try {
        // Verify folder exists and user owns it
        const folder = await Folder.findById(req.params.folderId);

        if (!folder) {
            return res.status(404).send('Not Found: No folder with the given ID exists');
        }

        if (!folder.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to access this folder');
        }

        const notes = await Note.find({ folder: req.params.folderId })
            .sort({ lastModified: -1 });

        const formattedNotes = notes.map(note => ({
            id: note._id,
            title: note.title,
            sectionCount: note.sections.length,
            createdAt: note.createdAt,
            lastModified: note.lastModified
        }));

        res.json({ notes: formattedNotes });
    } catch (err) {
        console.error('Error fetching notes:', err);
        res.status(500).send('Internal Server Error');
    }
});

// GET a single note by ID
router.get('/:noteId', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    try {
        const note = await Note.findById(req.params.noteId);

        if (!note) {
            return res.status(404).send('Not Found: No note with the given ID exists');
        }

        // Verify ownership
        if (!note.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to access this note');
        }

        const formattedNote = {
            id: note._id,
            title: note.title,
            sections: note.sections.map(section => ({
                id: section._id,
                title: section.title,
                notes: section.notes
            })),
            folderId: note.folder,
            createdAt: note.createdAt,
            lastModified: note.lastModified
        };

        res.json(formattedNote);
    } catch (err) {
        console.error('Error fetching note:', err);
        res.status(500).send('Internal Server Error');
    }
});

// POST create a new note
router.post('/', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    const { title, folderId, sections } = req.body;

    if (!title || !folderId) {
        return res.status(400).send('Bad Request: Title and folderId are required');
    }

    try {
        // Verify folder exists and user owns it
        const folder = await Folder.findById(folderId);

        if (!folder) {
            return res.status(404).send('Not Found: No folder with the given ID exists');
        }

        if (!folder.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to add notes to this folder');
        }

        const newNote = new Note({
            title,
            sections: sections || [],
            owner: req.user._id,
            folder: folderId
        });

        const savedNote = await newNote.save();

        // Add note reference to folder
        folder.notes.push(savedNote._id);
        await folder.save();

        const formattedNote = {
            id: savedNote._id,
            title: savedNote.title,
            sections: savedNote.sections.map(section => ({
                id: section._id,
                title: section.title,
                notes: section.notes
            })),
            folderId: savedNote.folder,
            createdAt: savedNote.createdAt,
            lastModified: savedNote.lastModified
        };

        res.status(201).json(formattedNote);
    } catch (err) {
        console.error('Error creating note:', err);
        res.status(500).send('Internal Server Error');
    }
});

// PUT update a note
router.put('/:noteId', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    const { title, sections } = req.body;

    try {
        const note = await Note.findById(req.params.noteId);

        if (!note) {
            return res.status(404).send('Not Found: No note with the given ID exists');
        }

        // Verify ownership
        if (!note.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to modify this note');
        }

        if (title) note.title = title;
        if (sections) note.sections = sections;

        const updatedNote = await note.save();

        const formattedNote = {
            id: updatedNote._id,
            title: updatedNote.title,
            sections: updatedNote.sections.map(section => ({
                id: section._id,
                title: section.title,
                notes: section.notes
            })),
            folderId: updatedNote.folder,
            lastModified: updatedNote.lastModified
        };

        res.json(formattedNote);
    } catch (err) {
        console.error('Error updating note:', err);
        res.status(500).send('Internal Server Error');
    }
});

// POST add a section to a note
router.post('/:noteId/sections', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    const { title, notes } = req.body;

    try {
        const note = await Note.findById(req.params.noteId);

        if (!note) {
            return res.status(404).send('Not Found: No note with the given ID exists');
        }

        // Verify ownership
        if (!note.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to modify this note');
        }

        note.sections.push({ title: title || '', notes: notes || '' });
        const updatedNote = await note.save();

        const newSection = updatedNote.sections[updatedNote.sections.length - 1];

        res.status(201).json({
            id: newSection._id,
            title: newSection.title,
            notes: newSection.notes
        });
    } catch (err) {
        console.error('Error adding section:', err);
        res.status(500).send('Internal Server Error');
    }
});

// PUT update a specific section
router.put('/:noteId/sections/:sectionId', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    const { title, notes } = req.body;

    try {
        const note = await Note.findById(req.params.noteId);

        if (!note) {
            return res.status(404).send('Not Found: No note with the given ID exists');
        }

        // Verify ownership
        if (!note.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to modify this note');
        }

        const section = note.sections.id(req.params.sectionId);
        if (!section) {
            console.log('Section not found. Available sections:', note.sections.map(s => ({ id: s._id.toString(), title: s.title })));
            console.log('Looking for section ID:', req.params.sectionId);
            return res.status(404).send('Not Found: No section with the given ID exists');
        }

        if (title !== undefined) section.title = title;
        if (notes !== undefined) section.notes = notes;

        const updatedNote = await note.save();
        const updatedSection = updatedNote.sections.id(req.params.sectionId);

        res.json({
            id: updatedSection._id,
            title: updatedSection.title,
            notes: updatedSection.notes
        });
    } catch (err) {
        console.error('Error updating section:', err);
        res.status(500).send('Internal Server Error');
    }
});

// DELETE a section
router.delete('/:noteId/sections/:sectionId', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    try {
        const note = await Note.findById(req.params.noteId);

        if (!note) {
            return res.status(404).send('Not Found: No note with the given ID exists');
        }

        // Verify ownership
        if (!note.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to modify this note');
        }

        note.sections.pull({ _id: req.params.sectionId });
        await note.save();

        res.json({ message: 'Section deleted successfully' });
    } catch (err) {
        console.error('Error deleting section:', err);
        res.status(500).send('Internal Server Error');
    }
});

// DELETE a note
router.delete('/:noteId', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    try {
        const note = await Note.findById(req.params.noteId);

        if (!note) {
            return res.status(404).send('Not Found: No note with the given ID exists');
        }

        // Verify ownership
        if (!note.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to delete this note');
        }

        // Remove note reference from folder
        await Folder.findByIdAndUpdate(note.folder, {
            $pull: { notes: note._id }
        });

        // Delete the note
        await Note.findByIdAndDelete(req.params.noteId);

        res.json({ message: 'Note deleted successfully' });
    } catch (err) {
        console.error('Error deleting note:', err);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
