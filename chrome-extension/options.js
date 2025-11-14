// Load saved settings
function loadSettings() {
    chrome.storage.sync.get(['apiUrl', 'authToken'], (result) => {
        document.getElementById('api-url').value = result.apiUrl || 'https://sharhapp.com/api';
        document.getElementById('auth-token').value = result.authToken || '';
    });
}

// Save settings
function saveSettings(e) {
    e.preventDefault();

    const apiUrl = document.getElementById('api-url').value.trim();
    const authToken = document.getElementById('auth-token').value.trim();

    if (!apiUrl || !authToken) {
        showStatus('Please fill in all fields', 'error');
        return;
    }

    chrome.storage.sync.set({
        apiUrl: apiUrl,
        authToken: authToken
    }, () => {
        showStatus('Settings saved successfully!', 'success');
    });
}

// Show status message
function showStatus(message, type) {
    const statusEl = document.getElementById('status-message');
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
    statusEl.style.display = 'block';

    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 3000);
}

// Initialize
document.addEventListener('DOMContentLoaded', loadSettings);
document.getElementById('settings-form').addEventListener('submit', saveSettings);
