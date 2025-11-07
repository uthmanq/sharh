const express = require('express');
const router = express.Router();
const axios = require('axios');
const Note = require('../models/Note');
const Folder = require('../models/Folder');
const authenticateToken = require('../middleware/authenticate');

// GET search books from usul.ai API
router.get('/search-books', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    const { q, limit = 20, locale = 'en' } = req.query;

    if (!q) {
        return res.status(400).send('Bad Request: Search query (q) is required');
    }

    try {
        const searchUrl = `https://api.usul.ai/search/books`;
        const response = await axios.get(searchUrl, {
            params: {
                q,
                limit: parseInt(limit),
                locale
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Error searching books from usul.ai:', error.message);
        res.status(500).send('Internal Server Error: Could not search books from usul.ai API');
    }
});

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

// GET a single note by ID with pagination
router.get('/:noteId', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const note = await Note.findById(req.params.noteId);

        if (!note) {
            return res.status(404).send('Not Found: No note with the given ID exists');
        }

        // Verify ownership
        if (!note.owner.equals(req.user._id)) {
            return res.status(403).send('Forbidden: You do not have permission to access this note');
        }

        const totalSections = note.sections.length;
        const paginatedSections = note.sections.slice(skip, skip + limitNum);

        const formattedNote = {
            id: note._id,
            title: note.title,
            sections: paginatedSections.map(section => ({
                id: section._id,
                title: section.title,
                notes: section.notes
            })),
            folderId: note.folder,
            createdAt: note.createdAt,
            lastModified: note.lastModified,
            pagination: {
                currentPage: pageNum,
                totalPages: Math.ceil(totalSections / limitNum),
                totalSections: totalSections,
                sectionsPerPage: limitNum,
                hasNextPage: skip + limitNum < totalSections,
                hasPreviousPage: pageNum > 1
            }
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
// POST import a book from usul-data API (converted to BlockNote block format)
// POST import a book from usul-data API — uses <span data-type="title"> for section breaks
router.post(
    '/import-book',
    authenticateToken(['user', 'editor', 'member', 'admin']),
    async (req, res) => {
        const { folderId, versionSource, versionValue, bookTitle } = req.body;

        if (!folderId || !versionSource || !versionValue) {
            return res
                .status(400)
                .send('Bad Request: folderId, versionSource, and versionValue are required');
        }

        try {
            // --- Verify folder ownership ---
            const folder = await Folder.findById(folderId);
            if (!folder) {
                return res.status(404).send('Not Found: No folder with the given ID exists');
            }
            if (!folder.owner.equals(req.user._id)) {
                return res
                    .status(403)
                    .send('Forbidden: You do not have permission to add notes to this folder');
            }

            // --- Fetch book content ---
            const bookUrl = `https://assets.usul.ai/book-content/${versionSource}/${versionValue}.json`;
            let bookContent;
            try {
                const response = await axios.get(bookUrl);
                bookContent = response.data;
            } catch (error) {
                console.error('Error fetching book from usul-data:', error.message);
                return res
                    .status(404)
                    .send('Not Found: Could not fetch book content from usul-data API');
            }

            // --- Helper: Convert plain text → BlockNote JSON (right-aligned) ---
            function toBlockNoteJSON(text) {
                if (!text || typeof text !== 'string') {
                    return JSON.stringify([{ type: 'paragraph', content: [] }]);
                }

                // Strip leftover HTML tags
                const clean = text.replace(/<[^>]+>/g, '').trim();

                // Convert to paragraphs
                const paragraphs = clean
                    .split(/\n+/)
                    .filter(line => line.trim() !== '')
                    .map(line => ({
                        type: 'paragraph',
                        props: { textAlignment: 'right' },
                        content: [{ type: 'text', text: line, styles: {} }],
                    }));

                if (paragraphs.length === 0) {
                    paragraphs.push({
                        type: 'paragraph',
                        props: { textAlignment: 'right' },
                        content: [],
                    });
                }

                return JSON.stringify(paragraphs);
            }

            // --- Helper: Parse <span data-type="title"> headings into sections ---
            function toBlockNoteSections(htmlText) {
                if (!htmlText || typeof htmlText !== 'string') return [];

                // Normalize breaks for easier splitting
                const normalized = htmlText.replace(/<br\s*\/?>/gi, '\n');

                // Split on spans marking titles
                const parts = normalized.split(
                    /<span[^>]*data-type=["']title["'][^>]*>(.*?)<\/span>/gi
                );

                const sections = [];

                // Optional preface before first heading
                if (parts[0]?.trim()) {
                    sections.push({
                        title: '',
                        notes: toBlockNoteJSON(parts[0]),
                    });
                }

                // Iterate over [title, content] pairs
                for (let i = 1; i < parts.length; i += 2) {
                    const title = parts[i]?.trim() || `Section ${sections.length + 1}`;
                    const content = parts[i + 1] || '';

                    sections.push({
                        title,
                        notes: toBlockNoteJSON(content),
                    });
                }

                return sections;
            }

            // --- Build sections ---
            const sections = [];

            if (bookContent.pages && Array.isArray(bookContent.pages)) {
                const pages = bookContent.pages;
                const headings = bookContent.headings || [];

                const pageToHeading = {};
                for (const heading of headings) {
                    pageToHeading[heading.pageIndex] = heading.title;
                }

                for (let i = 0; i < pages.length; i++) {
                    const page = pages[i];
                    if (page.text) {
                        // If <span data-type="title"> tags exist, split them
                        const derived = toBlockNoteSections(page.text);

                        if (derived.length > 0) {
                            sections.push(...derived);
                        } else {
                            // Fallback: use normal page title
                            const sectionTitle =
                                pageToHeading[i] || `Vol ${page.vol || '1'}, Page ${page.page || i + 1}`;

                            sections.push({
                                title: sectionTitle,
                                notes: toBlockNoteJSON(page.text),
                            });
                        }
                    }
                }
            } else if (Array.isArray(bookContent)) {
                for (const [index, chapter] of bookContent.entries()) {
                    const sectionTitle =
                        chapter.title || chapter.heading || `Chapter ${index + 1}`;
                    const sectionContent =
                        chapter.content || chapter.text || JSON.stringify(chapter);

                    const derived = toBlockNoteSections(sectionContent);
                    sections.push(...(derived.length ? derived : [{
                        title: sectionTitle,
                        notes: toBlockNoteJSON(sectionContent),
                    }]));
                }
            } else if (bookContent.parts || bookContent.chapters) {
                const parts = bookContent.parts || bookContent.chapters;
                for (const [index, part] of parts.entries()) {
                    const sectionTitle = part.title || part.heading || `Part ${index + 1}`;
                    const sectionContent = part.content || part.text || JSON.stringify(part);

                    const derived = toBlockNoteSections(sectionContent);
                    sections.push(...(derived.length ? derived : [{
                        title: sectionTitle,
                        notes: toBlockNoteJSON(sectionContent),
                    }]));
                }
            } else if (bookContent.content || bookContent.text) {
                const derived = toBlockNoteSections(
                    bookContent.content || bookContent.text
                );
                sections.push(...(derived.length ? derived : [{
                    title: 'Content',
                    notes: toBlockNoteJSON(bookContent.content || bookContent.text),
                }]));
            } else {
                sections.push({
                    title: 'Book Content',
                    notes: toBlockNoteJSON(JSON.stringify(bookContent, null, 2)),
                });
            }

            // --- Save note ---
            const noteTitle = bookTitle || `Imported Book - ${versionSource}/${versionValue}`;

            const newNote = new Note({
                title: noteTitle,
                sections,
                owner: req.user._id,
                folder: folderId,
            });

            const savedNote = await newNote.save();

            // Add reference in folder
            folder.notes.push(savedNote._id);
            await folder.save();

            const formattedNote = {
                id: savedNote._id,
                title: savedNote.title,
                sections: savedNote.sections.map(section => ({
                    id: section._id,
                    title: section.title,
                    notes: section.notes,
                })),
                folderId: savedNote.folder,
                createdAt: savedNote.createdAt,
                lastModified: savedNote.lastModified,
            };

            res.status(201).json(formattedNote);
        } catch (err) {
            console.error('Error importing book:', err);
            res.status(500).send('Internal Server Error');
        }
    }
);



module.exports = router;
