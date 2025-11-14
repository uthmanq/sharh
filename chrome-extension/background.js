// Background service worker for the Chrome extension
// This handles any background tasks if needed in the future

chrome.runtime.onInstalled.addListener(() => {
    console.log('Sharh Notes Clipper extension installed');
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'clipNote') {
        // This could be used for future enhancements
        // For now, all API calls are handled in popup.js
        sendResponse({ success: true });
    }
    return true;
});
