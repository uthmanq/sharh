const API_URL = 'https://app.ummahspot.com/api';

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
function showStatus(message, type = 'success') {
    const statusEl = document.getElementById('status-message');
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

// Initialize popup
async function init() {
    const authToken = await getAuthToken();
    const loginSection = document.getElementById('login-section');
    const clipSection = document.getElementById('clip-section');

    if (!authToken) {
        loginSection.style.display = 'block';
        clipSection.style.display = 'none';
        return;
    }

    loginSection.style.display = 'none';
    clipSection.style.display = 'block';

    // Get selected text and current URL from the page
    let currentTabUrl = '';
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        currentTabUrl = tab.url; // Store the current tab URL

        chrome.tabs.sendMessage(tab.id, { action: 'getSelection' }, (response) => {
            if (response && response.text) {
                document.getElementById('selected-text').value = response.text;
            }
        });
    } catch (error) {
        console.error('Error getting selection:', error);
    }

    // Load folders
    await populateFolders();

    // Setup event listeners
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

    document.getElementById('open-options').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
