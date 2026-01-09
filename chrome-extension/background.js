// Background service worker for the Chrome extension
const API_URL = 'https://app.ummahspot.com';

chrome.runtime.onInstalled.addListener(() => {
    console.log('Sharh Notes Clipper extension installed');
});

// Listen for messages from content scripts, popup, or options page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'clipNote') {
        // This could be used for future enhancements
        // For now, all API calls are handled in popup.js
        sendResponse({ success: true });
        return true;
    }

    if (request.action === 'launchGoogleOAuth') {
        // Handle Google OAuth flow
        handleGoogleOAuth()
            .then((result) => {
                sendResponse({ success: true, ...result });
            })
            .catch((error) => {
                console.error('OAuth error:', error);
                // Ensure we always send a descriptive error message
                const errorMessage = error.message || error.toString() || 'Failed to complete authentication. Please try again.';
                sendResponse({ success: false, error: errorMessage });
            });
        return true; // Keep the message channel open for async response
    }

    return true;
});

// Handle Google OAuth using chrome.identity
async function handleGoogleOAuth() {
    console.log('Background: handleGoogleOAuth called');

    const redirectUrl = chrome.identity.getRedirectURL('oauth');
    console.log('Background: Redirect URL:', redirectUrl);

    const authUrl = `${API_URL}/user/auth/google?source=extension&redirectUrl=${encodeURIComponent(redirectUrl)}`;
    console.log('Background: Auth URL:', authUrl);

    return new Promise((resolve, reject) => {
        chrome.identity.launchWebAuthFlow(
            {
                url: authUrl,
                interactive: true
            },
            async (responseUrl) => {
                console.log('Background: OAuth callback received');
                console.log('Background: Response URL:', responseUrl);

                if (chrome.runtime.lastError) {
                    console.error('Background: OAuth error:', chrome.runtime.lastError);
                    const errorMessage = chrome.runtime.lastError.message || 'OAuth flow was interrupted';
                    reject(new Error(errorMessage));
                    return;
                }

                if (responseUrl) {
                    try {
                        // Parse the response URL to extract token and user
                        const url = new URL(responseUrl);
                        const token = url.searchParams.get('token');
                        const userParam = url.searchParams.get('user');

                        console.log('Background: Token present:', !!token);
                        console.log('Background: User param present:', !!userParam);

                        if (token && userParam) {
                            const user = JSON.parse(decodeURIComponent(userParam));
                            console.log('Background: User data parsed:', user);

                            // Save auth data
                            await chrome.storage.sync.set({
                                authToken: token,
                                user: user
                            });

                            console.log('Background: Auth data saved to storage');
                            resolve({ token, user });
                        } else {
                            reject(new Error('No credentials received'));
                        }
                    } catch (e) {
                        console.error('Background: Error parsing response:', e);
                        const errorMessage = e.message || 'Failed to process authentication response';
                        reject(new Error(errorMessage));
                    }
                } else {
                    reject(new Error('Authentication cancelled'));
                }
            }
        );
    });
}
