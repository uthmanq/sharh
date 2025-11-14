const API_URL = 'https://app.ummahspot.com';

// Get authentication token from storage
async function getAuthToken() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(['authToken'], (result) => {
            resolve(result.authToken || '');
        });
    });
}

// Fetch folders from API
async function fetchFolders() {
    const authToken = await getAuthToken();

    if (!authToken) {
        return null;
    }

    try {
        console.log('Fetching folders from:', `${API_URL}/folders`);
        const response = await fetch(`${API_URL}/folders`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('Folders response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Folders error response:', errorText);
            throw new Error(`Failed to fetch folders: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('Folders data:', data);
        return data.folders || data;
    } catch (error) {
        console.error('Error fetching folders:', error);
        showStatus(`Error loading folders: ${error.message}`, 'error');
        return null;
    }
}

// Fetch notes for a specific folder
async function fetchNotes(folderId) {
    const authToken = await getAuthToken();

    if (!authToken) {
        return null;
    }

    try {
        console.log('Fetching notes from:', `${API_URL}/notes/folder/${folderId}`);
        const response = await fetch(`${API_URL}/notes/folder/${folderId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('Notes response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Notes error response:', errorText);
            throw new Error(`Failed to fetch notes: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('Notes data:', data);
        return data.notes || data;
    } catch (error) {
        console.error('Error fetching notes:', error);
        showStatus(`Error loading notes: ${error.message}`, 'error');
        return null;
    }
}

// Clip the note
async function clipNote(noteId, body, section, url, isArabic) {
    const authToken = await getAuthToken();

    if (!authToken) {
        showStatus('Please configure your API settings', 'error');
        return false;
    }

    try {
        const payload = {
            noteId,
            body
        };

        if (section) {
            payload.section = section;
        }

        if (url) {
            payload.url = url;
        }

        if (isArabic) {
            payload.isArabic = isArabic;
        }

        const response = await fetch(`${API_URL}/notes/clip`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to clip note');
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error clipping note:', error);
        showStatus(error.message, 'error');
        return false;
    }
}

// Show status message
function showStatus(message, type = 'success', elementId = 'status-message') {
    const statusEl = document.getElementById(elementId);
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
    statusEl.style.display = 'block';

    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 3000);
}

// Populate folder dropdown
async function populateFolders() {
    const folderSelect = document.getElementById('folder-select');
    const folders = await fetchFolders();

    if (!folders || folders.length === 0) {
        folderSelect.innerHTML = '<option value="">No folders found</option>';
        return;
    }

    folderSelect.innerHTML = '<option value="">Select a folder</option>';
    folders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder.id || folder._id;
        option.textContent = folder.title || folder.name;
        folderSelect.appendChild(option);
    });
}

// Populate notes dropdown
async function populateNotes(folderId) {
    const noteSelect = document.getElementById('note-select');
    const clipButton = document.getElementById('clip-button');

    if (!folderId) {
        noteSelect.innerHTML = '<option value="">Select a folder first</option>';
        clipButton.disabled = true;
        return;
    }

    noteSelect.innerHTML = '<option value="">Loading notes...</option>';
    const notes = await fetchNotes(folderId);

    if (!notes || notes.length === 0) {
        noteSelect.innerHTML = '<option value="">No notes in this folder</option>';
        clipButton.disabled = true;
        return;
    }

    noteSelect.innerHTML = '<option value="">Select a note</option>';
    notes.forEach(note => {
        const option = document.createElement('option');
        option.value = note.id || note._id;
        option.textContent = note.title;
        noteSelect.appendChild(option);
    });
}

// Fetch card collections from API
async function fetchCollections() {
    const authToken = await getAuthToken();

    if (!authToken) {
        return null;
    }

    try {
        console.log('Fetching collections from:', `${API_URL}/card-collections`);
        const response = await fetch(`${API_URL}/card-collections`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('Collections response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Collections error response:', errorText);
            throw new Error(`Failed to fetch collections: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('Collections data:', data);
        return data.collections || data;
    } catch (error) {
        console.error('Error fetching collections:', error);
        showStatus(`Error loading collections: ${error.message}`, 'error', 'card-status-message');
        return null;
    }
}

// Create a new card
async function createCard(front, back, collectionId, tags, notes) {
    const authToken = await getAuthToken();

    if (!authToken) {
        showStatus('Please configure your API settings', 'error', 'card-status-message');
        return false;
    }

    try {
        const payload = {
            front,
            back,
            collectionId
        };

        if (tags && tags.length > 0) {
            payload.tags = tags;
        }

        if (notes) {
            payload.notes = notes;
        }

        const response = await fetch(`${API_URL}/cards`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to create card');
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error creating card:', error);
        showStatus(error.message, 'error', 'card-status-message');
        return false;
    }
}

// Populate collections dropdown
async function populateCollections() {
    const collectionSelect = document.getElementById('collection-select');
    const collections = await fetchCollections();

    if (!collections || collections.length === 0) {
        collectionSelect.innerHTML = '<option value="">No collections found</option>';
        return;
    }

    collectionSelect.innerHTML = '<option value="">Select a collection</option>';
    collections.forEach(collection => {
        const option = document.createElement('option');
        option.value = collection.id || collection._id;
        option.textContent = collection.name;
        collectionSelect.appendChild(option);
    });
}

// Initialize popup
async function init() {
    const authToken = await getAuthToken();
    const loginSection = document.getElementById('login-section');
    const mainSection = document.getElementById('main-section');

    // Setup open options button (needed for login section)
    document.getElementById('open-options').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    if (!authToken) {
        loginSection.style.display = 'block';
        mainSection.style.display = 'none';
        return;
    }

    loginSection.style.display = 'none';
    mainSection.style.display = 'block';

    // Setup tab switching
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;

            // Update button states
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Update content visibility
            tabContents.forEach(content => {
                if (content.id === `${targetTab}-tab`) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });
        });
    });

    // Get selected text and current URL from the page
    let currentTabUrl = '';
    let selectedText = '';
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        currentTabUrl = tab.url; // Store the current tab URL

        chrome.tabs.sendMessage(tab.id, { action: 'getSelection' }, (response) => {
            if (response && response.text) {
                selectedText = response.text;
                // Populate both Notes and Cards tabs with selected text
                document.getElementById('selected-text').value = selectedText;
                document.getElementById('card-front').value = selectedText;
            }
        });
    } catch (error) {
        console.error('Error getting selection:', error);
    }

    // Load folders and collections
    await populateFolders();
    await populateCollections();

    // Setup Notes tab event listeners
    document.getElementById('folder-select').addEventListener('change', (e) => {
        populateNotes(e.target.value);
    });

    document.getElementById('note-select').addEventListener('change', (e) => {
        const clipButton = document.getElementById('clip-button');
        clipButton.disabled = !e.target.value;
    });

    document.getElementById('clip-button').addEventListener('click', async () => {
        const noteId = document.getElementById('note-select').value;
        const body = document.getElementById('selected-text').value.trim();
        const section = document.getElementById('section-input').value.trim();
        const isArabic = document.getElementById('is-arabic-checkbox').checked;

        if (!noteId || !body) {
            showStatus('Please select a note and enter some text', 'error');
            return;
        }

        // Show loading state
        const clipButton = document.getElementById('clip-button');
        const clipText = document.getElementById('clip-text');
        const clipLoader = document.getElementById('clip-loader');

        clipButton.disabled = true;
        clipText.style.display = 'none';
        clipLoader.style.display = 'inline-block';

        const result = await clipNote(noteId, body, section, currentTabUrl, isArabic);

        // Reset loading state
        clipButton.disabled = false;
        clipText.style.display = 'inline';
        clipLoader.style.display = 'none';

        if (result) {
            showStatus('Note clipped successfully!', 'success');
            // Clear the form
            document.getElementById('selected-text').value = '';
            document.getElementById('section-input').value = '';
            document.getElementById('is-arabic-checkbox').checked = false;
        }
    });

    // Setup Cards tab event listeners
    document.getElementById('collection-select').addEventListener('change', (e) => {
        const createCardButton = document.getElementById('create-card-button');
        createCardButton.disabled = !e.target.value;
    });

    document.getElementById('switch-button').addEventListener('click', () => {
        const frontField = document.getElementById('card-front');
        const backField = document.getElementById('card-back');

        // Swap the values
        const temp = frontField.value;
        frontField.value = backField.value;
        backField.value = temp;
    });

    document.getElementById('create-card-button').addEventListener('click', async () => {
        const front = document.getElementById('card-front').value.trim();
        const back = document.getElementById('card-back').value.trim();
        const collectionId = document.getElementById('collection-select').value;
        const tagsInput = document.getElementById('card-tags').value.trim();
        const notes = document.getElementById('card-notes').value.trim();

        if (!front || !back || !collectionId) {
            showStatus('Please fill in front, back, and select a collection', 'error', 'card-status-message');
            return;
        }

        // Parse tags
        const tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

        // Show loading state
        const createCardButton = document.getElementById('create-card-button');
        const createCardText = document.getElementById('create-card-text');
        const createCardLoader = document.getElementById('create-card-loader');

        createCardButton.disabled = true;
        createCardText.style.display = 'none';
        createCardLoader.style.display = 'inline-block';

        const result = await createCard(front, back, collectionId, tags, notes);

        // Reset loading state
        const collectionSelect = document.getElementById('collection-select');
        createCardButton.disabled = !collectionSelect.value;
        createCardText.style.display = 'inline';
        createCardLoader.style.display = 'none';

        if (result) {
            showStatus('Card created successfully!', 'success', 'card-status-message');
            // Clear the form
            document.getElementById('card-front').value = '';
            document.getElementById('card-back').value = '';
            document.getElementById('card-tags').value = '';
            document.getElementById('card-notes').value = '';
        }
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
