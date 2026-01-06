const API_BASE_URL = process.env.NODE_ENV === "production" ? 'https://app.ummahspot.com' : 'http://localhost:3000';

// Check authentication status on load
async function checkAuth() {
    const result = await chrome.storage.sync.get(['authToken', 'user']);

    if (result.authToken && result.user) {
        showLoggedInSection(result.user);
    } else {
        showLoginSection();
    }
}

// Show login section
function showLoginSection() {
    document.getElementById('login-section').classList.add('active');
    document.getElementById('register-section').classList.remove('active');
    document.getElementById('logged-in-section').classList.remove('active');
}

// Show register section
function showRegisterSection() {
    document.getElementById('login-section').classList.remove('active');
    document.getElementById('register-section').classList.add('active');
    document.getElementById('logged-in-section').classList.remove('active');
}

// Show logged in section
function showLoggedInSection(user) {
    document.getElementById('login-section').classList.remove('active');
    document.getElementById('register-section').classList.remove('active');
    document.getElementById('logged-in-section').classList.add('active');

    document.getElementById('user-email').textContent = user.email || 'N/A';
    document.getElementById('user-username').textContent = user.username || 'N/A';
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();

    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const loginBtn = e.target.querySelector('button[type="submit"]');
    const loader = document.getElementById('login-loader');

    if (!identifier || !password) {
        showStatus('Please fill in all fields', 'error');
        return;
    }

    // Show loading
    loginBtn.disabled = true;
    loader.style.display = 'inline-block';

    try {
        const response = await fetch(`${API_BASE_URL}/user/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ identifier, password })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Login failed');
        }

        const data = await response.json();

        // Save auth data
        await chrome.storage.sync.set({
            authToken: data.token,
            user: data.user
        });

        showStatus('Login successful!', 'success');
        setTimeout(() => {
            showLoggedInSection(data.user);
        }, 1000);

    } catch (error) {
        console.error('Login error:', error);
        showStatus(error.message, 'error');
    } finally {
        loginBtn.disabled = false;
        loader.style.display = 'none';
    }
}

// Handle registration
async function handleRegister(e) {
    e.preventDefault();

    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value.trim();
    const registerBtn = e.target.querySelector('button[type="submit"]');
    const loader = document.getElementById('register-loader');

    if (!username || !email || !password) {
        showStatus('Please fill in all fields', 'error');
        return;
    }

    // Show loading
    registerBtn.disabled = true;
    loader.style.display = 'inline-block';

    try {
        const response = await fetch(`${API_BASE_URL}/user/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Registration failed');
        }

        const data = await response.json();

        // Save auth data
        await chrome.storage.sync.set({
            authToken: data.token,
            user: data.user
        });

        showStatus('Registration successful!', 'success');
        setTimeout(() => {
            showLoggedInSection(data.user);
        }, 1000);

    } catch (error) {
        console.error('Registration error:', error);
        showStatus(error.message, 'error');
    } finally {
        registerBtn.disabled = false;
        loader.style.display = 'none';
    }
}

// Handle Google OAuth by sending message to background script
async function handleGoogleOAuth() {
    console.log('Options: Requesting OAuth from background script');
    showStatus('Opening authentication window...', 'success');

    try {
        const response = await chrome.runtime.sendMessage({ action: 'launchGoogleOAuth' });

        console.log('Options: Response from background:', response);

        if (response.success) {
            showStatus('Signed in successfully!', 'success');
            setTimeout(() => {
                showLoggedInSection(response.user);
            }, 1000);
        } else {
            showStatus('Authentication failed: ' + (response.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Options: OAuth error:', error);
        showStatus('Failed to launch authentication: ' + error.message, 'error');
    }
}

// Handle logout
async function handleLogout() {
    await chrome.storage.sync.remove(['authToken', 'user']);
    showStatus('Logged out successfully', 'success');
    setTimeout(showLoginSection, 1000);
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
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    // Toggle between login and register
    document.getElementById('show-register').addEventListener('click', showRegisterSection);
    document.getElementById('show-login').addEventListener('click', showLoginSection);

    // Form submissions
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);

    // Google OAuth buttons
    document.getElementById('google-login-btn').addEventListener('click', handleGoogleOAuth);
    document.getElementById('google-register-btn').addEventListener('click', handleGoogleOAuth);

    // Logout
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
});
